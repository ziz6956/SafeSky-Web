// SafeSky — конфигурация фронта (SAF-206).
// ВАЖНО: здесь только публичные настройки. Секреты (ключи SMS, JWT) живут
// ТОЛЬКО в бэкенде (Environment Variables Render) и на фронт не попадают.
window.SafeSkyConfig = {
  // Боевой Render-сервис (SAF-219, live 08.10 14:51Z: /health=200, db ok).
  // Локальная разработка — поднять backend (docker compose up) и временно
  // заменить на http://localhost:3000 (не коммитить).
  API_BASE_URL: "https://safesky-web.onrender.com",

  // Правила SMS-кода — дублируют серверные лимиты (канон SAF-206) для
  // отображения таймера и счётчика попыток. Источник истины — бэкенд:
  // при расхождении верны его ответы (retryAfterSec / attemptsLeft).
  SMS_RESEND_SECONDS: 30,
  SMS_ATTEMPTS_MAX: 3,
};
