# SafeSky — backend SMS-авторизации

Рабочий контур авторизации по телефону (SAF-206, одобрено основателем 07.10 17:51Z).

**Схема:** GitHub Pages (фронт) ➡️ Render (бэк) ➡️ Render Postgres, план free (БД).
Бэкенд лежит в `backend/`, чтобы не ломать GitHub Pages в корне репозитория.
Free Postgres Render живёт 30 дней (expiresAt в dashboard) — до пилота БД переносится
на РФ-VPS (SAF-86) сменой `DATABASE_URL` без изменений кода.

**Стек:** Node.js 20 + Express 4 + TypeScript + Prisma 5 + PostgreSQL.
Prisma обязателен по постановке: перенос БД на РФ-VPS (SAF-86) — сменой `DATABASE_URL`.

## Локальный запуск

```bash
cd backend
cp .env.example .env        # для локального запуска поправьте DATABASE_URL
docker compose up --build   # Postgres + backend, миграции накатываются сами
curl http://localhost:3000/health
```

Без Docker: поднимите Postgres сами, пропишите `DATABASE_URL`, затем
`npm ci && npx prisma migrate deploy && npm run build && npm start`.

Dev-режим SMS: `SMS_PROVIDER=console` (по умолчанию) — код печатается в лог сервера:
`[sms:dev] SMS → +79…: SafeSky: ваш код — 123456. Никому не сообщайте.`

## API

| Метод | Путь | Auth | Что делает |
|---|---|---|---|
| GET | `/health` | — | живость процесса + БД (для Render и UptimeRobot, пинг каждые 10 мин) |
| POST | `/api/auth/request-code` | — | выпуск 6-значного кода, отправка SMS |
| POST | `/api/auth/verify-code` | — | проверка кода, создание пользователя, выдача JWT |
| GET | `/api/me` | Bearer | текущий пользователь |
| PATCH | `/api/settings` | Bearer | домашний аэропорт, тумблер звонка (номер readonly) |

### POST /api/auth/request-code

Тело: `{ "phone": "+7 (999) 124-85-42" }` (принимается маска, восьмёрка, E.164).

Ответы:
- `202 { "ok": true, "resendAfterSec": 30 }` — SMS отправлен.
- `400 { "error": "INVALID_PHONE" }` — номер не похож на российский мобильный.
- `429 { "error": "RESEND_TOO_SOON", "retryAfterSec": N }` — повторная отправка не чаще 30 с.
- `429 { "error": "TOO_MANY_REQUESTS" }` — rate-limit по IP (20 кодов / 15 мин — защита бюджета SMS).
- `502 { "error": "SMS_SEND_FAILED" }` — провайдер SMS не сработал (код не создан).

### POST /api/auth/verify-code

Тело: `{ "phone": "…", "code": "123456" }`.

Ответы:
- `200 { "ok": true, "token": "…", "user": { phone, airport, callsEnabled } }`.
- `401 { "error": "CODE_INVALID", "attemptsLeft": N }` — неверный код.
- `423 { "error": "CODE_BLOCKED" }` — 3 неверные попытки, код мёртв (запросите новый).
- `410 { "error": "CODE_EXPIRED" }` — истёк TTL 5 минут.
- `404 { "error": "CODE_NOT_FOUND" }` — сначала `request-code`.
- `400 { "error": "INVALID_PHONE" | "INVALID_CODE_FORMAT" }`.

### GET /api/me, PATCH /api/settings

Заголовок: `Authorization: Bearer <token>`.

- `GET /api/me` → `200 { "user": { phone, airport, callsEnabled } }`.
- `PATCH /api/settings` с телом `{ "airport": "DME" }` и/или `{ "callsEnabled": false }` → `200 { "user": … }`.
- Аэропорты (whitelist): `DME SVO VKO LED AER KZN KUF GOJ`; иначе `400 INVALID_AIRPORT`.
- Без/с неверным токеном: `401 { "error": "UNAUTHORIZED" }`.

## Правила кода (канон постановки, всё — серверно)

- 6 цифр, криптографический `crypto.randomInt`;
- TTL 5 минут с момента отправки;
- максимум 3 попытки на код, после 3-й неверной код блокируется (`CODE_BLOCKED`);
- повторная отправка не чаще 30 секунд (`RESEND_TOO_SOON` + `retryAfterSec`);
- шаблон SMS: «SafeSky: ваш код — XXXXXX. Никому не сообщайте.» (1 сегмент, ~3 ₽ — SAF-190);
- в БД хранится только HMAC-SHA256 кода (`JWT_SECRET`), открытым текстом код не лежит;
- пользователь создаётся только при успешной верификации — брошенные регистрации не мусорят `users`.

## SMS-провайдер

Паттерн SAF-114: нейтральный интерфейс (`src/sms/provider.ts`), реализации изолированы.

- **Exolve** (`SMS_PROVIDER=exolve`, основной): `POST https://api.exolve.ru/messaging/v1/SendSMS`,
  Bearer-ключ, `{ number, destination, text }`, номера 11 цифр без «+» (контракт SAF-179).
- **Console** (`SMS_PROVIDER=console`, dev): код в лог сервера, SMS не отправляется.

Смена провайдера — только после согласования основателя (постановка SAF-206).

## CORS

Точный origin `https://ziz6956.github.io` (+ дополнительные из `CORS_ORIGINS` через запятую);
`http://localhost:*` разрешён автоматически для локальной разработки. Авторизация — Bearer-токен,
поэтому точного origin достаточно; `credentials: true` включён на случай перехода на куки
(с куками — без «*», требование ТЗ).

## Env-переменные

См. `.env.example`. Секреты — только в Environment Variables Render, в GitHub не коммитим:

- `DATABASE_URL` — строка подключения Supabase/Postgres;
- `JWT_SECRET` — секрет подписи токенов (`openssl rand -hex 32`);
- `CORS_ORIGINS` — точные origin через запятую;
- `EXOLVE_API_KEY`, `EXOLVE_SENDER` — для боевой отправки SMS;
- `TELEGRAM_BOT_TOKEN` — зарезервировано (дублирование кода в Telegram — опция, не реализовано);
- `NODE_ENV=production`, `PORT`.

## Docker

- `Dockerfile` — multi-stage `node:20-alpine`: build (`npm ci` → `prisma generate` → `tsc`) →
  runtime (`npm ci --omit=dev`), `USER node`, `EXPOSE ${PORT}`.
- `CMD`: `prisma migrate deploy && node dist/server.js` — авто-миграции при старте
  (идемпотентны). Отклонение от буквального `CMD node dist/server.js` из ТЗ — осознанное;
  при ручном накатывании миграций CMD можно упростить.
- `docker-compose.yml` — локальный контур: postgres:16 + backend.

## Render (что делает основатель)

1. Render → New Web Service → репозиторий `ziz6956/SafeSky-Web`, Docker, Root Directory = `backend`.
2. Environment Variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS=https://ziz6956.github.io`,
   `EXOLVE_API_KEY`, `EXOLVE_SENDER`, `NODE_ENV=production`, `PORT=3000` (SMS до получения
   ключей Exolve работает в `console`-режиме — коды в логах Render).
3. UptimeRobot: пинг `https://<render-service>.onrender.com/health` каждые 10 минут (Render не засыпал).
4. Передать URL сервиса в SAF-206 — фронт пропишет `API_BASE_URL` в `config.js`.

## Проверка

- `npm test` — unit-тесты чистой логики (нормализация номера, лимиты).
- `npm run smoke` — e2e-прогон API против поднятого контура (см. `scripts/smoke.sh`).
