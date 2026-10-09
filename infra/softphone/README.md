# Софтфон SafeSky — тестовый прозвон через Plusofon (SAF-234/235)

Управляемый SIP-софтфон на выделенном сервере: регистрируется в Plusofon,
совершает исходящий звонок, воспроизводит аудио «Это тестовый прозвон сервиса
SafeSky» и кладёт трубку. Кнопка «Тестовый прозвон» — первый этап обкатки;
дальше тот же механизм переводится на событийный запуск (бэкенд сам обзванивает
список номеров при тревоге).

## Почему отдельный сервер, а не Render

Render не поддерживает UDP ни на одном тарифе: SIP-сигнализация (UDP 5060) и
RTP-медиа там не пройдут. Поэтому софтфон живёт на лёгком VPS, а Render-бэкенд
остаётся оркестратором: `POST /api/test-call` → задание в очередь → воркер
звонит → статус в очередь.

```
кнопка (GitHub Pages) → POST /api/test-call (Render) → call_jobs (Render Postgres)
                                                          ↓ poll (2 c, HTTP)
        воркер pjsua2 (VPS) ← SIP-регистрация ← <аккаунт>.voice.plusofon.ru:5060
                ↓ звонок → WAV 8 кГц → сброс → POST /queue/<id>/result
```

Воркер ходит в очередь только через HTTP-эндпоинты Render
(`GET /api/test-call/queue/poll`, `POST /api/test-call/queue/<id>/result`) —
прямого подключения к Render Postgres извне нет (free-тариф).

## ⚠️ Хост воркера должен иметь российский IP

Справка Plusofon («Общие настройки оборудования», help.plusofon.ru):
**«использование SIP возможно только для оборудования, имеющего российский
IP-адрес»**. Белый список IP в ЛК (SIP-аккаунты → Белые IP-адреса) на
регистрацию не распространяется — только на исходящие вызовы.

Эмпирически (SAF-235, 09.10.2026): с Hetzner (Финляндия) REGISTER/UDP-OPTIONS
на 185.54.49.80/83:5060 не получают ответа при живом ICMP и доступном API
Plusofon — SIP-грань фильтрует иностранные IP. Вывод: софтфон должен жить на
хосте с РФ-IP (кандидат — РФ-VPS «Ерус-7502-3», прод-хост по SAF-86).
Hetzner-инстанс ниже остаётся как dev-песочница для кода/очереди.

## Выбор инстанса: CPX22 (обоснование)

Требование прототипа — **1 одновременный звонок**. Для него нужны:

| Ресурс | Потребность | CPX22 (минимальный тип текущей линейки) |
|---|---|---|
| CPU | G.711-транскодинг ≈ единицы % ядра | 2 vCPU (shared AMD) — запас на мониторинг и ретраи |
| RAM | pjsua2 idle ≈ 40–60 МБ; звонок ≈ +20–30 МБ | 4 GB — запас ×20 |
| Сеть | RTP ≈ 87 кбит/с на звонок | 20 TB/мес включено |
| IP | нужен публичный IPv4 (входящий RTP от Plusofon) | 1 IPv4 включён |

Брать меньше нечего: линейка CX11 снята, «Cost-Optimized»-ярус на сайте Hetzner
недоступен. CPX22 ≈ **€3,8–4,6/мес без НДС** (≈ €4,5–5,5 с НДС; цена после
корректировки тарифов апреля 2026). При переходе на боевой обзвон масштабируем
вверх (CX32) или запускаем N воркеров за балансировкой.

## Структура

```
terraform/   — инстанс, firewall (SSH / SIP 5060 / RTP 10000–20000), SSH-ключ
ansible/     — установка pjsua2, деплой воркера, env-файл, systemd-юнит
worker/      — worker.py (pjsua2 + HTTP-очередь Render), bootstrap_sip.py (SIP-аккаунт через API Plusofon)
audio/       — .gitkeep; WAV кладётся локально перед провижинингом (в репо не хранится)
```

## Переменные и секреты

| Переменная | Где задаётся | Назначение |
|---|---|---|
| `HCLOUD_TOKEN` | локальный shell у того, кто гоняет terraform (НЕ Render — рантайму он не нужен; в будущем — GitHub Actions secret, когда включим CI) | токен Hetzner Cloud API; hcloud-провайдер читает его автоматически |
| `TF_VAR_ssh_public_key` | локальный shell | публичный SSH-ключ управления |
| `SIP_LOGIN`, `SIP_PASSWORD` | env при запуске Ansible → `/etc/safesky-softphone/env` (0600) на сервере | учётные данные SIP-аккаунта Plusofon |
| `SIP_SERVER` | env при запуске Ansible → env-файл на сервере | персональный адрес из ЛК Plusofon: `<аккаунт>.voice.plusofon.ru` («sip.plusofon.ru» не существует — SAF-235) |
| `QUEUE_BASE_URL`, `WORKER_TOKEN` | env при запуске Ansible → env-файл на сервере | очередь Render: базовый URL бэкенда + Bearer-токен эндпоинтов `/api/test-call/queue/*` |
| `PLUSOFON_API_TOKEN` | env при запуске Ansible (опционально) | создание SIP-аккаунта через API (`bootstrap_sip.py`) |

Секреты в репозиторий и комментарии не попадают — только имена.

## Как задеплоить

1. **Hetzner:** создать API-токен (Cloud → Security → API Tokens) с доступом
   Read & Write. В проекте Hetzner создать SSH-ключ не нужно — terraform заведёт
   его сам из `TF_VAR_ssh_public_key`.
2. **Сервер:**
   ```bash
   cd terraform
   export HCLOUD_TOKEN=... TF_VAR_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
   terraform init && terraform plan && terraform apply
   terraform output server_ipv4        # IP для inventory
   ```
   Для боевого софтфона этот шаг выполняется на хосте с РФ-IP (см. выше) —
   плейбук и воркер host-agnostic, меняется только инвентарь.
3. **Софтфон:**
   ```bash
   cd ansible
   cp hosts.ini.example hosts.ini      # подставить IP из шага 2
   export SIP_LOGIN=... SIP_PASSWORD=...       # из bootstrap или ЛК Plusofon
   export SIP_SERVER=<аккаунт>.voice.plusofon.ru   # из ЛК Plusofon
   export QUEUE_BASE_URL=https://safesky-web.onrender.com
   export WORKER_TOKEN=...
   ansible-playbook -i hosts.ini playbook.yml
   ```
   Если `PLUSOFON_API_TOKEN` задан, плейбук сам создаст SIP-аккаунт
   `safesky-softphone` через API (`PUT /api/v1/sip` + `PATCH` пароля) и выведет
   логин. Иначе аккаунт создаётся в ЛК Plusofon вручную.

## Как проверить

1. **Регистрация и разовый звонок** (без очереди и без фронта):
   ```bash
   ssh root@<IP>
   systemctl status safesky-softphone           # active (running)
   journalctl -u safesky-softphone | grep регистрация   # «SIP-регистрация активна»
   sudo -u safesky env $(cat /etc/safesky-softphone/env | xargs) \
     python3 /opt/safesky-softphone/worker.py --once --phone 79XXXXXXXXX
   ```
   На номер должен прийти звонок с сообщением «Это тестовый прозвон сервиса
   SafeSky», после воспроизведения — сброс. Выход: код 0 = delivered, 1 = failed.
2. **Через очередь:** нажать кнопку «Тестовый прозвон» в ЛК (или
   `POST /api/test-call` с Bearer-токеном пользователя) → воркер заберёт
   задание в течение ~2 с, статус пройдёт `ringing → delivered/failed`.
3. **Клейм и гонка:** два воркера на одной очереди — задание достанется
   ровно одному (updateMany с guard'ом `status=pending`), второй получит 204.
   «Зависшее» `ringing` (воркер упал после клейма) вернётся в очередь через
   5 минут по `updatedAt`.

## Схема очереди (Render Postgres)

```
call_jobs: id, userId, phone, status (pending|ringing|delivered|failed),
           worker, error, completedAt, createdAt, updatedAt
```

POST `/api/test-call` пишет `pending`-задание (номер из профиля пользователя),
воркер клеймит (`ringing`), звонит и пишет терминальный статус. Терминальные
статусы иммутабельны: повторная запись результата не откатывает завершённое
задание (урок SAF-198). Для боевого сценария структура та же — меняется
только источник заданий (событие тревоги со списком номеров).

## Аудио

`audio/test-call-ru.wav` — фраза «Это тестовый прозвон сервиса SafeSky»,
WAV 16-bit PCM, mono, 8 кГц (родной формат pjsua2), длительность ≈ 3,7 с.
**В публичном репозитории не хранится** (ограничение SAF-234); в репо только
`audio/.gitkeep` (плейбук копирует каталог как есть), а `audio/*.wav` — в
`.gitignore`. На сервер файл уже доставлен.

Генерация при смене текста: TTS (Google translate_tts, голос ru) → конвертация
24 кГц → 8 кГц, 16-bit PCM, mono; положить файл локально в
`infra/softphone/audio/test-call-ru.wav` и перезапустить плейбук
(или `systemctl restart safesky-softphone`).

## Ограничения прототипа и известные TODO

- **1 одновременный звонок** (`maxCalls = 1`): очередь сериализует задания.
- **Хост с РФ-IP обязателен** для боевого софтфона (правило Plusofon) —
  см. раздел выше; Hetzner-инстанс для боевой регистрации не годится.
- **Firewall:** SIP/RTP входящие пока открыты на 0.0.0.0/0 — после пуска
  сузить до IP медиа-серверов Plusofon (185.54.49.80–83, см. справку);
  SSH сузить до IP исполнителя (`terraform.tfvars` → `ssh_allowed_ips`).
- **SIP через UDP.** Если у провайдера/оператора будут проблемы с NAT —
  переключить воркер на TCP/TLS (`SIP_PORT`, `SIP_LOCAL_PORT` в env-файле).
- **ПДн:** прототип звонит только на номер владельца (тест). Боевой обзвон с
  массовыми номерами на сервере вне РФ-контура — сверка с Legal
  (гео-ограничения SAF-82/SAF-87) перед запуском.
- **WORKER_TOKEN на Render:** после мержа добавить env `WORKER_TOKEN` на
  сервис `safesky-web` (Render dashboard/API); без него POST /api/test-call
  отвечает честным 503 TEST_CALL_UNAVAILABLE, очередь не копится.
