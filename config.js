// SafeSky — конфигурация фронта (SAF-206).
// ВАЖНО: здесь только публичные настройки. Секреты (ключи SMS, JWT) живут
// ТОЛЬКО в бэкенде (Environment Variables Render) и на фронт не попадают.
window.SafeSkyConfig = {
  // Плейсхолдер до появления Render URL — основатель передаст URL позже
  // (задача SAF-206), после чего это значение заменяется на боевое, вида:
  //   API_BASE_URL: "https://safesky-backend.onrender.com"
  // Значение по умолчанию указывает на локальный бэкенд (docker compose up)
  // — так прототип работает и до публикации Render-сервиса.
  API_BASE_URL: "http://localhost:3000",

  // Правила SMS-кода — дублируют серверные лимиты (канон SAF-206) для
  // отображения таймера и счётчика попыток. Источник истины — бэкенд:
  // при расхождении верны его ответы (retryAfterSec / attemptsLeft).
  SMS_RESEND_SECONDS: 30,
  SMS_ATTEMPTS_MAX: 3,
};
