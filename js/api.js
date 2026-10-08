// SafeSky — клиент бэкенда SMS-авторизации (SAF-206).
// Все запросы к бэкенду идут ТОЛЬКО через этот модуль. Секреты сюда не попадают.
//
// Подключение на странице (порядок важен):
//   <script src="config.js"></script>
//   <script src="js/api.js"></script>
//
// === Контракт (для UX/UI, SAF-207) ===
//
// SafeSkyApi.requestCode(phone) → { ok: true, resendAfterSec: 30 }
//   Ошибки: 400 INVALID_PHONE · 429 RESEND_TOO_SOON (err.retryAfterSec) ·
//           429 TOO_MANY_REQUESTS · 502 SMS_SEND_FAILED
//
// SafeSkyApi.verifyCode(phone, code) → { ok: true, token, user: { phone, airport, callsEnabled } }
//   Ошибки: 400 INVALID_PHONE / INVALID_CODE_FORMAT · 401 CODE_INVALID (err.attemptsLeft) ·
//           410 CODE_EXPIRED · 423 CODE_BLOCKED · 404 CODE_NOT_FOUND
//   После успеха токен уже сохранён (localStorage "safesky_token") — можно
//   переводить пользователя в ЛК.
//
// SafeSkyApi.getMe() → { user: { phone, airport, callsEnabled } }
// SafeSkyApi.patchSettings({ airport?, callsEnabled? }) → { user }
//   (Bearer-токен подставляется автоматически; 401 UNAUTHORIZED — показать вход)
//
// Во всех ошибках: err.code — машинный код (см. выше), err.message — текст для человека.
(function (global) {
  "use strict";

  var cfg = global.SafeSkyConfig || {};
  var BASE = String(cfg.API_BASE_URL || "").replace(/\/+$/, "");
  var TOKEN_KEY = "safesky_token";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* приватный режим */ }
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* приватный режим */ }
  }

  function apiError(res, data) {
    var err = new Error((data && data.message) || ("HTTP " + res.status));
    err.status = res.status;
    err.code = (data && data.error) || "UNKNOWN";
    if (data) {
      if (data.retryAfterSec !== undefined) err.retryAfterSec = data.retryAfterSec;
      if (data.attemptsLeft !== undefined) err.attemptsLeft = data.attemptsLeft;
    }
    return err;
  }

  function request(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    if (options.auth !== false) {
      var token = getToken();
      if (token) headers["Authorization"] = "Bearer " + token;
    }
    return fetch(BASE + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw apiError(res, data);
        return data;
      });
    });
  }

  global.SafeSkyApi = {
    BASE: BASE,
    requestCode: function (phone) {
      return request("/api/auth/request-code", { method: "POST", auth: false, body: { phone: phone } });
    },
    verifyCode: function (phone, code) {
      return request("/api/auth/verify-code", { method: "POST", auth: false, body: { phone: phone, code: code } })
        .then(function (data) {
          setToken(data.token);
          return data;
        });
    },
    getMe: function () {
      return request("/api/me");
    },
    patchSettings: function (patch) {
      return request("/api/settings", { method: "PATCH", body: patch });
    },
    getToken: getToken,
    clearToken: clearToken,
  };
})(window);
