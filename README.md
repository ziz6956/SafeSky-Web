# SafeSky-Web — публичный прототип

Публичный прототип сервиса «Безопасное Небо» (SafeSky): оповещения о закрытии аэропортов по телефону.
Опубликован через GitHub Pages (ветка `main`, корень репозитория).

**Живой прототип:** https://ziz6956.github.io/SafeSky-Web/

## Сценарий прототипа

1. `index.html` — лендинг: описание сервиса, принцип работы, форма регистрации
   (телефон + согласие на обработку персональных данных).
2. `connected.html` — экран «Подключено» после регистрации.
3. `lk.html` — личный кабинет: панель мониторинга аэропортов.

Дополнительные страницы: `legal.html` (правовая информация), `shader.html` (демо шейдера).

## Структура репозитория

- `index.html`, `connected.html`, `lk.html`, `legal.html`, `shader.html` —
  публикуемые страницы (в корне, требование GitHub Pages).
- `stitch_alert_service/` — исходный архив дизайн-макетов, сохранён целиком как референс:
  - `_1` лендинг, `_2` правовая информация, `_3` лендинг (мобильный),
    `_4` «Подключено», `_5` «Подключено» (мобильный), `_6` личный кабинет,
    `_7` ЛК (мобильный), `_8` дубликат `_1`, `shader/` демо шейдера;
  - `safesky_nocturne/DESIGN.md` — описание дизайн-системы Nocturne.
- `design-mockups/` — скриншоты экранов (лендинг, правовая информация,
  «Подключено», ЛК + мобильные варианты).
- `docs/screenshots/` — контрольные скриншоты рендера на ширине 375px
  (доказательство отсутствия горизонтального скролла).
- `docs/DESIGN.md` — копия описания дизайн-системы Nocturne.

## Технологии

- Статические HTML-страницы, Tailwind CSS 3.4.x через CDN (версия зафиксирована).
- Шрифты: Inter, Space Grotesk, Material Symbols Outlined (Google Fonts).

## Бэкенд и Render (SAF-206/SAF-219)

Бэкенд SMS-авторизации — в `backend/` (Node 20 + Express + Prisma). Деплой: Render
(Web Service, Docker, регион frankfurt, план free) + Render Postgres (free).

- `render.yaml` — Blueprint/IaC целевого состояния контура. Секреты в репозиторий
  не кладут: имена env без значений, `JWT_SECRET` генерирует Render
  (`generateValue: true`), реальные значения — на Render (dashboard/API).
- Прод-URL: https://safesky-web.onrender.com (проверка: `GET /health` → 200).
- Env сервиса (имена): `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`,
  `NODE_ENV=production`, `SMS_PROVIDER=console`, заглушки `EXOLVE_API_KEY`,
  `EXOLVE_SENDER`, `TELEGRAM_BOT_TOKEN` (кодом не используется).
- Free Postgres Render живёт 30 дней с момента создания — до пилота БД
  переносится на РФ-VPS (SAF-86) сменой `DATABASE_URL` без изменений кода.
- Локальный запуск бэкенда — `backend/README.md`.

## Публикация

GitHub Pages на ветке `main`, корень репозитория. Страницы обновляются
автоматически после мержа в `main`.
