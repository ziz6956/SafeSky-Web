#!/usr/bin/env bash
# e2e-прогон API против работающего бэкенда (docker compose up --build).
# Код для положительного пути берите из лога: docker compose logs -f backend
# и передавайте через SMOKE_CODE. Отрицательные пути проверяются без кода.
set -euo pipefail

BASE="${API_BASE_URL:-http://localhost:3000}"
PHONE="${SMOKE_PHONE:-+79991234567}"
CODE="${SMOKE_CODE:-}"

req() { # req METHOD PATH [JSON]
  curl -sS -o /tmp/smoke_body -w "%{http_code}" -X "$1" -H "Content-Type: application/json" \
    ${3:+-d "$3"} "${BASE}${2}"
}

echo "== 1. /health =="
code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" "${BASE}/health")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "200" ] || { echo "FAIL: health"; exit 1; }

echo "== 2. request-code (первая отправка — 202) =="
code=$(req POST /api/auth/request-code "{\"phone\":\"${PHONE}\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "202" ] || { echo "FAIL: request-code"; exit 1; }

echo "== 3. request-code сразу повторно (429, retryAfterSec) =="
code=$(req POST /api/auth/request-code "{\"phone\":\"${PHONE}\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "429" ] || { echo "FAIL: resend cooldown"; exit 1; }

echo "== 4. verify-code с неверным кодом ×3 (401 → 401 → 423) =="
code=$(req POST /api/auth/verify-code "{\"phone\":\"${PHONE}\",\"code\":\"000000\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "401" ] || { echo "FAIL: wrong code #1"; exit 1; }
code=$(req POST /api/auth/verify-code "{\"phone\":\"${PHONE}\",\"code\":\"000000\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "401" ] || { echo "FAIL: wrong code #2"; exit 1; }
code=$(req POST /api/auth/verify-code "{\"phone\":\"${PHONE}\",\"code\":\"000000\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "423" ] || { echo "FAIL: block after 3"; exit 1; }

echo "== 5. verify-code с неверным форматом (400) =="
code=$(req POST /api/auth/verify-code "{\"phone\":\"${PHONE}\",\"code\":\"12\"}")
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "400" ] || { echo "FAIL: format"; exit 1; }

echo "== 6. request-code без токена — запросы me/settings (401) =="
code=$(req GET /api/me)
echo "HTTP ${code}: $(cat /tmp/smoke_body)"
[ "$code" = "401" ] || { echo "FAIL: me unauth"; exit 1; }

if [ -n "$CODE" ]; then
  echo "== 7. новый код (после 30с паузы или на новый номер) + verify успешный =="
  sleep 31
  req POST /api/auth/request-code "{\"phone\":\"${PHONE}\"}" >/dev/null
  # callsConsent:true — согласие на автоматические вызовы (SAF-244):
  # при создании пользователя пишется запись-доказательство в call_consents.
  code=$(req POST /api/auth/verify-code "{\"phone\":\"${PHONE}\",\"code\":\"${CODE}\",\"callsConsent\":true}")
  echo "HTTP ${code}: $(cat /tmp/smoke_body)"
  [ "$code" = "200" ] || { echo "FAIL: verify ok"; exit 1; }
  TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/smoke_body'))['token'])")

  echo "== 8. GET /api/me с токеном =="
  code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BASE}/api/me")
  echo "HTTP ${code}: $(cat /tmp/smoke_body)"
  [ "$code" = "200" ] || { echo "FAIL: me"; exit 1; }

  echo "== 9. PATCH /api/settings (airport + callsEnabled) =="
  code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d '{"airport":"LED","callsEnabled":false}' "${BASE}/api/settings")
  echo "HTTP ${code}: $(cat /tmp/smoke_body)"
  [ "$code" = "200" ] || { echo "FAIL: settings"; exit 1; }

  echo "== 10. PATCH /api/settings с неверным аэропортом (400) =="
  code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d '{"airport":"XXX"}' "${BASE}/api/settings")
  echo "HTTP ${code}: $(cat /tmp/smoke_body)"
  [ "$code" = "400" ] || { echo "FAIL: bad airport"; exit 1; }
else
  echo "(SMOKE_CODE не задан — положительный путь пропущен)"
fi

echo "SMOKE OK"
