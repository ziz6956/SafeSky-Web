# Софтфон SafeSky — тестовый прозвон через Plusofon (SAF-234/235/276)

Управляемый SIP-софтфон на выделенном сервере: регистрируется в Plusofon,
совершает исходящий звонок, воспроизводит аудио «Это тестовый прозвон сервиса
SafeSky» **после ответа абонента** и кладёт трубку. Кнопка «Тестовый прозвон» —
первый этап обкатки; дальше тот же механизм переводится на событийный запуск
(бэкенд сам обзванивает список номеров при тревоге).

**Боевой хост (SAF-276): RuVDS Уфа** — IP в env агента (`SOFTPHONE_SSH_HOST`),
Debian 13, 2 ГБ RAM, 20 ГБ HDD. Хост РФ — требование Plusofon и ч. 5 ст. 18
152-ФЗ соблюдена. Hetzner/terraform ниже — только dev-песочница.

## Почему отдельный сервер, а не Render

Render не поддерживает UDP ни на одном тарифе: SIP-сигнализация (UDP 5060) и
RTP-медиа там не пройдут. Поэтому софтфон живёт на лёгком VPS, а Render-бэкенд
остаётся оркестратором: `POST /api/test-call` → задание в очередь → воркер
звонит → статус в очередь.

**Почему RuVDS (история хостов).** Hetzner (Финляндия) не проходит: грань
Plusofon фильтрует иностранные IP (SAF-235, 09.10.2026). serv.host (Москва)
оказался непригоден: DPI-фильтр SIP-трафика, официальный отказ поддержки.
RuVDS Уфа проверен основателем вручную: REGISTER — 200 OK, исходящий звонок
183→200 OK, RTP в обе стороны.

```
кнопка (GitHub Pages) → POST /api/test-call (Render) → call_jobs (Render Postgres)
                                                          ↓ poll (2 c, HTTP)
        воркер (RuVDS) ← ctrl_tcp 127.0.0.1:4444 ← baresip (RuVDS)
                ↓ dial → 200 OK → ausrc aufile,WAV → автосброс → POST /queue/<id>/result
```

Воркер ходит в очередь только через HTTP-эндпоинты Render
(`GET /api/test-call/queue/poll`, `POST /api/test-call/queue/<id>/result`) —
прямого подключения к Render Postgres извне нет (free-тариф).

## Архитектура: baresip + ctrl_tcp + Python-воркер (путь A)

Инструмент — **baresip** (штатный пакет Debian 13) с модулем **ctrl_tcp**:
baresip держит SIP-регистрацию и звонки, воркер управляет им по TCP
(127.0.0.1:4444, сообщения — netstring `<len>:<json>,`).

**Баг, который решаем.** Если задать `audio_source aufile,…` в конфиге,
файл начинает играть с начала звонка — ещё в early media (183) — и к моменту
ответа абонента уже заканчивается; baresip при этом рвёт звонок
(AUDIO_ERROR → CALL_CLOSED) до появления CALL_ESTABLISHED. В трубке тишина.

**Фикс A1 (основной):** `audio_source` из конфига убран вовсе. Воркер по
событию `CALL_ESTABLISHED` (200 OK) шлёт `ausrc aufile,<wav>` — аудиоисточник
подключается к уже установленному звонку, сообщение звучит после поднятия
трубки. По окончании файла baresip закрывает звонок сам — штатный автосброс.
Если абонент не ответил за `CALL_TIMEOUT` (60 с) — воркер шлёт `hangup`.

**Фикс A2 (запасной, та же обвязка Python):** если без источника звонок не
держится в фазе 183 — прогнать плейбук с `AUDIO_FALLBACK_SILENCE=true`:
в конфиг попадёт `audio_source aufile,silence.wav` (10 мин тишины,
генерируется плейбуком), по 200 OK воркер точно так же подменяет источник
на тестовый WAV.

**Fallback B (только если ausrc-подмена нестабильна):** pjsua CLI
`--auto-play --play-file` без Python-биндингов (SWIG на 2 ГБ не собирать;
C-сборка pjproject на 2 ГБ обычно проходит с -j1/-j2).

## ⚠️ Хост воркера должен иметь российский IP

Справка Plusofon («Общие настройки оборудования», help.plusofon.ru):
**«использование SIP возможно только для оборудования, имеющего российский
IP-адрес»**. Белый список IP в ЛК (SIP-аккаунты → Белые IP-адреса) на
регистрацию не распространяется — только на исходящие вызовы.

RuVDS (Уфа) — хост РФ, регистрация проходит. **Опрос очереди Render на
не-РФ хосте запрещён ч. 5 ст. 18 152-ФЗ** (SAF-240 §4, G-CALL-2, SAF-246):
в env он рендерится только при осознанном `QUEUE_ENABLED=true`.

## Структура

```
ansible/     — плейбук Debian 13: baresip + ctrl_tcp, accounts, env, systemd, ufw
  templates/ — baresip-config.j2, accounts.j2, safesky-baresip.service.j2,
               safesky-softphone.service.j2, safesky-softphone.env.j2
worker/      — worker.py (ctrl_tcp + HTTP-очередь Render), bootstrap_sip.py
               (SIP-аккаунт через API Plusofon)
audio/       — .gitkeep; WAV кладётся локально перед провижинингом
terraform/   — DEV-ПЕСОЧНИЦА (Hetzner): IaC старого инстанса, для боевой
               регистрации непригодна (не РФ-IP) — см. раздел ниже
```

## Переменные и секреты

| Переменная | Где задаётся | Назначение |
|---|---|---|
| `SOFTPHONE_SSH_HOST`, `SOFTPHONE_SSH_USER`, `SOFTPHONE_SSH_PASSWORD` | env агента | доступ к узлу (root@RuVDS). Плейбук запускается с `-c paramiko -e "ansible_password=$SOFTPHONE_SSH_PASSWORD"` |
| `SIP_LOGIN`, `SIP_PASSWORD` | env при запуске Ansible → `/etc/safesky-softphone/env` (0600) и `accounts` baresip (0600) на сервере | учётные данные SIP-аккаунта Plusofon. **Без них env и accounts на сервере не перезаписываются** (SAF-251) |
| `SIP_SERVER` | env при запуске Ansible → env-файл на сервере | персональный адрес из ЛК Plusofon: `<аккаунт>.voice.plusofon.ru` («sip.plusofon.ru» не существует — SAF-235) |
| `QUEUE_ENABLED` | env при запуске Ansible (опционально, по умолчанию `false`) | осознанное включение очереди в env. **Только на РФ-хосте** (SAF-240 §4, G-CALL-2, SAF-246). На RuVDS включено (SAF-276) |
| `QUEUE_BASE_URL`, `WORKER_TOKEN` | env при запуске Ansible → env-файл на сервере (только при `QUEUE_ENABLED=true`) | очередь Render: базовый URL бэкенда + Bearer-токен эндпоинтов `/api/test-call/queue/*` |
| `PLUSOFON_API_TOKEN` | env при запуске Ansible (опционально) | создание SIP-аккаунта через API (`bootstrap_sip.py`) |
| `AUDIO_FALLBACK_SILENCE` | env при запуске Ansible (опционально, по умолчанию `false`) | фикс A2: silence.wav аудиоисточником в конфиге baresip |

Env-файл сервера дополнительно: `BARESIP_CTRL_HOST/PORT` (127.0.0.1:4444),
`AUDIO_FILE`, `POLL_INTERVAL`, `REG_TIMEOUT`, `CALL_TIMEOUT` (60 с).
Секреты в репозиторий и комментарии не попадают — только имена.

## Как задеплоить (RuVDS)

```bash
cd infra/softphone/ansible
cp hosts.ini.example hosts.ini      # IP RuVDS уже в примере; при смене узла — поправить

export SIP_LOGIN=... SIP_PASSWORD=...                 # из bootstrap или ЛК Plusofon
export SIP_SERVER=<аккаунт>.voice.plusofon.ru         # из ЛК Plusofon

# Очередь Render — осознанно, на РФ-хосте:
export QUEUE_ENABLED=true
export QUEUE_BASE_URL=https://safesky-web.onrender.com
export WORKER_TOKEN=...

ansible-playbook -i hosts.ini playbook.yml -c paramiko \
  -e "ansible_password=$SOFTPHONE_SSH_PASSWORD"
```

Прогон без SIP-секретов env-файл и accounts на сервере не трогает
(SAF-251) — так можно обновлять код воркера, не имея кредов SIP. На свежем
узле без env-файла прогон с пустыми секретами падает assert'ом (fail-closed).

Если `PLUSOFON_API_TOKEN` задан, плейбук сам создаст SIP-аккаунт
`safesky-softphone` через API (`PUT /api/v1/sip` + `PATCH` пароля) и выведет
логин. Иначе аккаунт создаётся в ЛК Plusofon вручную.

## Как проверить

1. **Регистрация и разовый звонок** (без очереди и без фронта):
   ```bash
   ssh root@<IP>
   systemctl status safesky-baresip safesky-softphone   # оба active (running)
   journalctl -u safesky-baresip | grep -i register      # REGISTER_OK / 200
   sudo -u safesky env $(cat /etc/safesky-softphone/env | xargs) \
     python3 /opt/safesky-softphone/worker.py --once --phone 79XXXXXXXXX
   ```
   На номер должен прийти звонок; сообщение слышно **после поднятия трубки**,
   затем автосброс. Выход: код 0 = delivered, 1 = failed, 2 = нет регистрации.
   В журнале воркера виден порядок: `dial` → `CALL_PROGRESS` (183) →
   `200 OK — подключаю аудиоисточник` → `звонок завершён: delivered`.
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
задание (урок SAF-198). Контракт в SAF-276 не менялся. Для боевого сценария
структура та же — меняется только источник заданий (событие тревоги со
списком номеров).

## Аудио

`audio/test-call-ru.wav` — фраза «Это тестовый прозвон сервиса SafeSky»,
WAV 16-bit PCM, mono, 8 кГц, длительность ≈ 3,7 с. **В публичном репозитории
не хранится** (ограничение SAF-234); в репо только `audio/.gitkeep`
(плейбук копирует каталог как есть), а `audio/*.wav` — в `.gitignore`.
На сервер файл уже доставлен.

Генерация при смене текста: TTS (Google translate_tts, голос ru) → конвертация
24 кГц → 8 кГц, 16-bit PCM, mono; положить файл локально в
`infra/softphone/audio/test-call-ru.wav` и перезапустить плейбук.

## Харденинг узла (SAF-270, перенесено на RuVDS)

**ufw — 5060/udp только от SIP-сети Plusofon** (внешнего файрвола у RuVDS
нет, ufw — периметр узла; правила применяет плейбук):

```bash
ufw allow from 185.54.49.80/30 to any port 5060 proto udp   # сигнализация .80/.83, медиа .81/.82
ufw allow from 151.241.171.225 to any port 5060 proto udp   # входящие INVITE (SAF-269)
ufw allow 10000:20000/udp                                   # RTP-медиа
```

Default-политика ufw — `deny (incoming)`, исходящие не затронуты: REGISTER
наружу работает, входящие INVITE от Plusofon проходят. Правила лежат в
`/etc/ufw/user.rules`, переживают ребут.

**systemd-юниты — без бесконечного crash-loop.** При ошибке конфигурации
baresip/воркер выходят ненулевым кодом; `Restart=on-failure` +
`StartLimitBurst=3` / `StartLimitIntervalSec=1800` (в секции `[Unit]`):
после трёх неудач за 30 мин юнит переходит в `failed`, причина видна в
`journalctl -u safesky-baresip` / `-u safesky-softphone`. Восстановление:

```bash
systemctl reset-failed safesky-baresip && systemctl start safesky-baresip
```

## Ограничения прототипа и известные TODO

- **1 одновременный звонок**: воркер сериализует задания (новое берётся
  только после завершения текущего).
- **Firewall:** SIP 5060/udp сужен до SIP-сети Plusofon. **RTP 10000–20000/udp
  всё ещё открыт на 0.0.0.0/0** — сузить до медиа-IP Plusofon
  (185.54.49.81/82) отдельной задачей после прогона тестовых звонков;
  **SSH 22/tcp открыт на 0.0.0.0/0** (password-auth по env основателя) —
  кандидаты на улучшение: SSH-ключи или сужение до IP исполнителя.
- **SIP через UDP.** Если у провайдера/оператора будут проблемы с NAT —
  переключить baresip на TCP/TLS (`sip_trans_def tcp` в конфиге).
- **ПДн:** прототип звонит только на номер владельца (тест). Боевой обзвон с
  массовыми номерами — сверка с Legal (гео-ограничения SAF-82/SAF-87) перед
  запуском. Узел RuVDS — РФ, ч. 5 ст. 18 152-ФЗ соблюдена.
- **WORKER_TOKEN на Render:** после мержа добавить env `WORKER_TOKEN` на
  сервис `safesky-web` (Render dashboard/API); без него POST /api/test-call
  отвечает честным 503 TEST_CALL_UNAVAILABLE, очередь не копится.

## Dev-песочница: Hetzner/terraform (НЕ для боевой регистрации)

`terraform/` — IaC инстанса Hetzner (CPX22) с прежних итераций (SAF-234/235).
Оставлен как dev-песочница для экспериментов с кодом воркера:
**для боевой регистрации непригоден** — Hetzner (Финляндия) не РФ-IP,
грань Plusofon фильтрует REGISTER (проверено эмпирически, SAF-235), а опрос
очереди Render с не-РФ хоста запрещён ч. 5 ст. 18 152-ФЗ. На dev-инстансе
очередь должна оставаться выключенной (без `QUEUE_ENABLED=true` строки
очереди в env закомментированы, SAF-251).

```bash
# Только для dev-экспериментов:
cd terraform
export HCLOUD_TOKEN=... TF_VAR_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"
terraform init && terraform apply
```
