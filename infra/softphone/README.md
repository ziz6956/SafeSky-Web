# Софтфон SafeSky — тестовый прозвон через Plusofon (SAF-234)

Управляемый SIP-софтфон на выделенном сервере: регистрируется в Plusofon,
совершает исходящий звонок, воспроизводит аудио «Это тестовый прозвон сервиса
SafeSky» и кладёт трубку. Кнопка «Тестовый прозвон» — первый этап обкатки;
дальше тот же механизм переводится на событийный запуск (бэкенд сам обзванивает
список номеров при тревоге).

## Почему отдельный сервер, а не Render

Render не поддерживает UDP ни на одном тарифе: SIP-сигнализация (UDP 5060) и
RTP-медиа там не пройдут. Поэтому софтфон живёт на лёгком VPS (Hetzner Cloud),
а Render-бэкенд остаётся оркестратором: `POST /api/test-call` → задание в
очередь → воркер звонит → статус на фронт.

```
кнопка (GitHub Pages) → POST /api/test-call (Render) → call_queue (Supabase)
                                                          ↓ poll (2 c)
        воркер pjsua2 (Hetzner) ← SIP-регистрация ← sip.plusofon.ru:5060
                ↓ звонок → WAV 8 кГц → сброс → статус в очередь
```

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
worker/      — worker.py (pjsua2 + очередь Supabase), bootstrap_sip.py (SIP-аккаунт через API Plusofon)
audio/       — test-call-ru.wav «Это тестовый прозвон сервиса SafeSky»
```

## Переменные и секреты

| Переменная | Где задаётся | Назначение |
|---|---|---|
| `HCLOUD_TOKEN` | локальный shell у того, кто гоняет terraform (НЕ Render — рантайму он не нужен; в будущем — GitHub Actions secret, когда включим CI) | токен Hetzner Cloud API; hcloud-провайдер читает его автоматически |
| `TF_VAR_ssh_public_key` | локальный shell | публичный SSH-ключ управления |
| `SIP_LOGIN`, `SIP_PASSWORD` | env при запуске Ansible → `/etc/safesky-softphone/env` (0600) на сервере | учётные данные SIP-аккаунта Plusofon |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | env при запуске Ansible → env-файл на сервере | очередь `call_queue` |
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
3. **Софтфон:**
   ```bash
   cd ansible
   cp hosts.ini.example hosts.ini      # подставить IP из шага 2
   export SIP_LOGIN=... SIP_PASSWORD=...       # из bootstrap или ЛК Plusofon
   export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
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
2. **Через очередь:** в Supabase
   `INSERT INTO call_queue (phone) VALUES ('79XXXXXXXXX')` → воркер заберёт
   задание в течение ~2 с, `status` пройдёт `ringing → delivered`.
3. **Через кнопку:** после подключения Render-бэкенда (следующий PR) —
   кнопка «Тестовый прозвон» в ЛК.

## Схема очереди (Supabase)

```sql
create table public.call_queue (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                       -- 79XXXXXXXXX
  status text not null default 'pending',    -- pending | ringing | delivered | failed
  worker text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.call_queue enable row level security;
```

Render-бэкенд пишет `pending`-задания (service key), воркер забирает и
обновляет статус. Для боевого сценария структура та же — меняется только
источник заданий (событие тревоги со списком номеров).

## Аудио

`audio/test-call-ru.wav` — фраза «Это тестовый прозвон сервиса SafeSky»,
WAV 16-bit PCM, mono, 8 кГц (родной формат pjsua2), длительность ≈ 3,7 с.
Сгенерирован TTS (Google translate_tts, голос ru) с конвертацией 24 кГц → 8 кГц.
Секретной информации в записи нет — файл публичен по указанию основателя.
При смене текста: тот же формат; положить файл в `audio/` и перезапустить
плейбук (или `systemctl restart safesky-softphone`).

## Ограничения прототипа и известные TODO

- **1 одновременный звонок** (`maxCalls = 1`): очередь сериализует задания.
- **Firewall:** SIP/RTP входящие пока открыты на 0.0.0.0/0 — после пуска
  сузить до IP медиа-серверов Plusofon; SSH сузить до IP исполнителя
  (`terraform.tfvars` → `ssh_allowed_ips`).
- **SIP через UDP.** Если у провайдера/оператора будут проблемы с NAT —
  переключить воркер на TCP/TLS (`SIP_PORT`, `SIP_LOCAL_PORT` в env-файле).
- **ПДн:** прототип звонит только на номер владельца (тест). Боевой обзвон с
  массовыми номерами на сервере вне РФ-контура — сверка с Legal
  (гео-ограничения SAF-82/SAF-87) перед запуском.
- **Аутентификация очереди:** сейчас service key в env-файле воркера;
  для боевого — отдельная таблица + RLS на уровне приложения.
