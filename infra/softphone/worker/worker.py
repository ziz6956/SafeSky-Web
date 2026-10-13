#!/usr/bin/env python3
"""SAF-276: софтфон-воркер (baresip + ctrl_tcp) — тестовый прозвон через Plusofon.

baresip держит SIP-регистрацию в Plusofon и выполняет звонки; воркер управляет
им по ctrl_tcp (TCP 127.0.0.1:4444, сообщения — netstring `<len>:<json>,`).

Воспроизведение WAV — только по событию CALL_ESTABLISHED (200 OK): команда
`ausrc aufile,<wav>` подменяет аудиоисточник уже установленного звонка.
Причина такого устройства (SAF-234→SAF-276): `audio_source aufile,…` в конфиге
baresip стартует с начала звонка, файл (≈2,5 с) заканчивается ещё в early
media (183), и baresip рвёт звонок (AUDIO_ERROR → CALL_CLOSED) до ответа
абонента — в трубке тишина. После окончания файла baresip закрывает звонок
сам — штатный автосброс. Если абонент не ответил за CALL_TIMEOUT (60 с) —
воркер шлёт `hangup`.

Источник заданий — очередь Render (HTTP-эндпоинты /api/test-call/queue/*;
контракт БЕЗ изменений, терминальные статусы иммутабельны — SAF-198).
Разовая проверка без очереди:

    python3 worker.py --once --phone 79991234567

Переменные окружения (все секреты — в /etc/safesky-softphone/env, см. Ansible):
  SIP_LOGIN, SIP_PASSWORD, SIP_SERVER — учётные данные SIP-аккаунта Plusofon
      (сам аккаунт baresip берёт из accounts-файла; воркеру SIP_SERVER нужен
      для построения dial-URI, а полный комплект — как сигнал, что env готов)
  BARESIP_CTRL_HOST, BARESIP_CTRL_PORT — адрес ctrl_tcp baresip (127.0.0.1:4444)
  AUDIO_FILE                 — WAV для воспроизведения (16-bit PCM, mono)
  QUEUE_BASE_URL             — базовый URL бэкенда Render
  WORKER_TOKEN               — Bearer-токен эндпоинтов очереди
  POLL_INTERVAL, REG_TIMEOUT, CALL_TIMEOUT — интервал опроса очереди (с) /
      таймаут регистрации в --once (с) / таймаут ответа абонента (с)
"""

import argparse
import json
import os
import queue
import re
import socket
import sys
import threading
import time
import urllib.request
import wave

AUDIO_FILE = os.environ.get("AUDIO_FILE", "/opt/safesky-softphone/audio/test-call-ru.wav")
SIP_SERVER = os.environ.get("SIP_SERVER", "")
SIP_LOGIN = os.environ.get("SIP_LOGIN", "")
SIP_PASSWORD = os.environ.get("SIP_PASSWORD", "")
CTRL_HOST = os.environ.get("BARESIP_CTRL_HOST", "127.0.0.1")
CTRL_PORT = int(os.environ.get("BARESIP_CTRL_PORT", "4444"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "2.0"))
REG_TIMEOUT = float(os.environ.get("REG_TIMEOUT", "30.0"))
CALL_TIMEOUT = int(os.environ.get("CALL_TIMEOUT", "60"))
# Повторная проверка регистрации, пока она не подтверждена (с).
REG_CHECK_INTERVAL = 30.0

QUEUE_BASE_URL = os.environ.get("QUEUE_BASE_URL", "")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def wav_duration(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def mask_phone(phone: str) -> str:
    """+7 (9**) ***-**-99 — номер не попадает в журнал в открытом виде.

    Хост воркера — РФ (RuVDS), но журналы могут выгружаться наружу: маска —
    дешёвая страховка (SAF-246). Не бросает исключений.
    """
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) < 4:
        return "***"
    return f"+{digits[0]} ({digits[1]}**) ***-**-{digits[-2:]}"


# 11 цифр с необязательными разделителями (пробел/дефис/скобки) между ними:
# `79991234567`, `+7 (999) 123-45-67`, `8 999 123 45 67`. Lookaround-гварды
# не дают съесть соседние цифры (SAF-288, SAF-246 § 11.3).
_PHONE_RE = re.compile(r"(?<!\d)[78](?:[\s\-()]*\d){10}(?!\d)")


def redact(text: str) -> str:
    """Маскировать 11-значные номера (7XXXXXXXXXX / 8XXXXXXXXXX) в тексте,
    в т.ч. разделённые пробелами/дефисами/скобками.

    Тексты исключений baresip могут включать Request-URI; перечислить все такие
    места нельзя, поэтому маскируем по шаблону (SAF-246).
    """
    return _PHONE_RE.sub(lambda m: mask_phone(m.group(0)), text)


def normalize_phone(phone: str) -> str:
    """79991234567 — международный формат без '+'."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if len(digits) != 11 or not digits.startswith("7"):
        raise ValueError(f"номер не в формате 79XXXXXXXXX: {mask_phone(phone)}")
    return digits


# --- ctrl_tcp: netstring ---------------------------------------------------

class NetstringError(Exception):
    pass


class BaresipCtl:
    """Клиент ctrl_tcp: подключение, команды, чтение сообщений (netstring)."""

    def __init__(self, host: str, port: int, timeout: float = 5.0):
        self.addr = (host, port)
        self.timeout = timeout
        self.sock = None
        self.buf = b""

    def connect(self) -> None:
        self.close()
        self.sock = socket.create_connection(self.addr, timeout=self.timeout)
        self.sock.settimeout(self.timeout)
        self.buf = b""

    def close(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None
        self.buf = b""

    def send(self, cmd: str, params: str = "") -> None:
        """Команда baresip 1.x: netstring `<len>:<json>,` с полями
        command/params (протокол ctrl_tcp 1.1 — JSON-команды). Номера в
        командах маскируются в журнале."""
        payload = {"command": cmd}
        if params:
            payload["params"] = params
        data = json.dumps(payload, ensure_ascii=False).encode()
        frame = str(len(data)).encode() + b":" + data + b","
        log(f"> {redact(cmd + (' ' + params if params else ''))}")
        self.sock.sendall(frame)

    def _fill(self) -> None:
        chunk = self.sock.recv(4096)
        if not chunk:
            raise NetstringError("соединение ctrl_tcp закрыто")
        self.buf += chunk

    def recv_message(self) -> str:
        """Одно сообщение: netstring `<len>:<data>,` → текст."""
        while True:
            idx = self.buf.find(b":")
            if idx == -1:
                self._fill()
                continue
            prefix = self.buf[:idx]
            if not prefix.isdigit():
                raise NetstringError(f"нет длины netstring: {self.buf[:64]!r}")
            length = int(prefix)
            while len(self.buf) < idx + 1 + length + 1:
                self._fill()
            data = self.buf[idx + 1: idx + 1 + length]
            if self.buf[idx + 1 + length: idx + 2 + length] != b",":
                raise NetstringError("нет ',' после данных netstring")
            self.buf = self.buf[idx + 2 + length:]
            return data.decode("utf-8", "replace")

    def events(self):
        """Поток сообщений ctrl_tcp 1.1: события baresip — JSON-объекты
        {"event": true, "type": ..., "id": ...}, ответы на команды —
        {"response": true, "ok": ..., "data": ...}; прочее — {"_text": ...}."""
        while True:
            text = self.recv_message()
            try:
                obj = json.loads(text)
                if isinstance(obj, dict):
                    yield obj
                    continue
            except json.JSONDecodeError:
                pass
            yield {"_text": text.strip()}


# --- состояние звонка -------------------------------------------------------

class CallSession:
    """Один исходящий звонок (maxCalls=1 — одновременно только один)."""

    def __init__(self, job_id: str | None, phone: str):
        self.job_id = job_id
        self.phone = phone
        self.callid = None
        self.established = False
        self.closed = False
        self.result = None  # 'delivered' | 'failed'
        self.deadline = time.time() + CALL_TIMEOUT  # таймаут ответа абонента
        self.audio_deadline = None  # страховочный hangup после отыгрыша


# --- воркер -----------------------------------------------------------------

class Worker:
    def __init__(self):
        self.ctl = BaresipCtl(CTRL_HOST, CTRL_PORT)
        self.msg_q: queue.Queue = queue.Queue()
        self.reader = None
        self.registered = None  # None=неизвестно
        self.last_reg_check = 0.0
        self.active = None  # текущий исходящий звонок
        self.calls = {}  # callid → CallSession

    # -- подключение --------------------------------------------------------

    def connect(self, attempts: int = 10) -> bool:
        for attempt in range(1, attempts + 1):
            try:
                self.ctl.connect()
                self._start_reader()
                log(f"ctrl_tcp подключён ({CTRL_HOST}:{CTRL_PORT})")
                return True
            except OSError as e:
                log(f"ctrl_tcp недоступен (попытка {attempt}/{attempts}): {e}")
                time.sleep(min(2 * attempt, 15))
        return False

    def _start_reader(self) -> None:
        self.reader = threading.Thread(target=self._reader_loop, daemon=True)
        self.reader.start()

    def _reader_loop(self) -> None:
        try:
            for msg in self.ctl.events():
                self.msg_q.put(msg)
        except Exception as e:  # noqa: BLE001 — поток-читатель обязан доложить и умереть
            self.msg_q.put({"_err": str(e)})

    def reconnect(self) -> None:
        """Соединение потеряно: текущий звонок — failed, затем переподключение."""
        self.ctl.close()
        if self.active:
            s = self.active
            log("соединение ctrl_tcp потеряно во время звонка — failed")
            s.result = "failed"
            self.finalize(s)
        while not self.connect():
            pass
        self.check_registered()

    # -- события ------------------------------------------------------------

    def handle_event(self, ev: dict) -> None:
        # baresip 1.1: события {"event": true, "type": ...} — тип в поле "type".
        name = ev.get("type")
        if name == "REGISTER_OK":
            self.registered = True
            log("SIP-регистрация активна (событие baresip)")
        elif name == "REGISTER_FAIL":
            self.registered = False
            log("SIP-регистрация потеряна (REGISTER_FAIL) — baresip перерегистрируется сам")
        elif name in ("CALL_PROGRESS", "CALL_RINGING"):
            if ev.get("direction") == "outgoing":
                self._bind_call(ev)
        elif name == "CALL_ESTABLISHED":
            if ev.get("direction") == "outgoing":
                s = self._bind_call(ev)
                if s and not s.established:
                    s.established = True
                    log(f"200 OK — подключаю аудиоисточник: ausrc aufile,{AUDIO_FILE}")
                    try:
                        self.ctl.send("ausrc", f"aufile,{AUDIO_FILE}")
                    except OSError as e:
                        log(f"ausrc не ушёл: {e}")
                    # Страховка: если baresip не закроет звонок сам по окончании
                    # файла — hangup через длительность + запас.
                    s.audio_deadline = time.time() + wav_duration(AUDIO_FILE) + 3.0
        elif name == "CALL_CLOSED":
            self._close_call(ev)
        elif name == "AUDIO_ERROR":
            log(f"AUDIO_ERROR (по окончании файла — ожидаемо): {redact(str(ev))[:160]}")

    def _bind_call(self, ev: dict) -> CallSession | None:
        callid = ev.get("id")  # baresip 1.1: id звонка — поле "id", не "callid"
        if callid:
            s = self.calls.get(callid)
            if s is None and self.active is not None:
                # maxCalls=1: неизвестный callid — это и есть текущий звонок.
                s = self.active
                s.callid = callid
                self.calls[callid] = s
            return s
        return self.active

    def _close_call(self, ev: dict) -> None:
        callid = ev.get("id")  # baresip 1.1: id звонка — поле "id"
        s = self.calls.pop(callid, None) if callid else self.active
        if s is None:
            log(f"CALL_CLOSED без сопоставленного звонка: {redact(str(ev))[:160]}")
            return
        if not s.closed:
            s.closed = True
            s.result = "delivered" if s.established else "failed"
            log(f"звонок завершён: {s.result} (reason: {redact(str(ev.get('reason', '')))[:120]})")
            self.finalize(s)

    def finalize(self, s: CallSession) -> None:
        if s.callid and self.calls.get(s.callid) is s:
            del self.calls[s.callid]
        if self.active is s:
            self.active = None
        if s.result is None:
            s.result = "failed"
        if s.job_id:
            payload = {"status": s.result}
            if s.result == "failed":
                payload["error"] = "см. журнал воркера"
            try:
                http_json("POST", f"{QUEUE_BASE_URL}/api/test-call/queue/{s.job_id}/result", payload)
                log(f"задание {s.job_id}: {s.result} записан в очередь")
            except Exception as e:  # noqa: BLE001 — задание вернётся по stale-таймауту
                log(f"не удалось записать результат задания {s.job_id}: {e}")

    # -- регистрация ---------------------------------------------------------

    def check_registered(self) -> None:
        """reginfo (baresip 1.1): ответ {"response":true,"ok":...} со строкой
        «0 - sip:<aor> OK Expires …» в data → регистрация активна.
        Команды uareg в 1.1 нет."""
        self.last_reg_check = time.time()
        try:
            self.ctl.send("reginfo")
        except OSError as e:
            self.registered = False
            log(f"reginfo не ушёл: {e}")
            return
        deadline = time.time() + 3.0
        while time.time() < deadline:
            try:
                msg = self.msg_q.get(timeout=max(0.2, deadline - time.time()))
            except queue.Empty:
                break
            if isinstance(msg, dict) and msg.get("event") is True:
                self.handle_event(msg)
                continue
            if isinstance(msg, dict) and "response" in msg:
                ok = bool(msg.get("ok"))
                data = str(msg.get("data") or "")
                # baresip 1.1 reginfo: «--- User Agents (1) ---» +
                # «0 - sip:<aor> OK   Expires 300s» (OK = статус регистрации).
                # Запасной формат (ua_print_status): «200 OK ... [1 binding]».
                active = ("--- user agents" in data.lower()
                          and re.search(r"sip:\S+\s+OK\b", data)) \
                    or ("200 ok" in data.lower() and "binding" in data.lower())
                if ok and active:
                    self.registered = True
                    log("SIP-регистрация активна (reginfo)")
                else:
                    self.registered = False
                    log(f"reginfo: ok={ok} {redact(data)[:160]}")
                return
            log(f"reginfo: неожиданное сообщение {redact(str(msg))[:160]}")
        log("ответ reginfo не получен")
        self.registered = False

    # -- цикл ------------------------------------------------------------------

    def drain_events(self, limit: int = 100) -> None:
        for _ in range(limit):
            try:
                msg = self.msg_q.get_nowait()
            except queue.Empty:
                return
            if "_err" in msg:
                log(f"соединение ctrl_tcp разорвано: {msg['_err']}")
                self.reconnect()
                return
            if isinstance(msg, dict) and msg.get("event") is True:
                self.handle_event(msg)
            elif isinstance(msg, dict) and "response" in msg:
                # Ответ на команду вне check_registered — журналируем.
                log(f"baresip ответ: ok={msg.get('ok')} {redact(str(msg.get('data', '')))[:160]}")
            else:
                log(f"baresip: {redact(str(msg))[:160]}")

    def tick(self) -> None:
        """Одна итерация: события, таймауты, очередь."""
        self.drain_events()
        now = time.time()
        s = self.active
        if s is None:
            if self.registered is not True or now - self.last_reg_check > REG_CHECK_INTERVAL:
                self.check_registered()
            if self.registered is True:
                job = poll_queue()
                if job:
                    self.start_call(job)
            return
        # Активный звонок: страховочные таймауты.
        if not s.closed and s.established and s.audio_deadline and now > s.audio_deadline:
            log("аудио доиграно, а звонок не закрыт — hangup (страховка)")
            try:
                self.ctl.send("hangup")
            except OSError as e:
                log(f"hangup не ушёл: {e}")
            s.result = "delivered"
            self.finalize(s)
            return
        if not s.closed and now > s.deadline:
            log(f"абонент не ответил за {CALL_TIMEOUT} с — hangup, failed")
            try:
                self.ctl.send("hangup")
            except OSError as e:
                log(f"hangup не ушёл: {e}")
            s.result = "failed"
            self.finalize(s)

    def start_call(self, job: dict) -> None:
        try:
            digits = normalize_phone(job["phone"])
        except ValueError as e:
            log(f"некорректный номер в задании: {e}")
            http_json("POST", f"{QUEUE_BASE_URL}/api/test-call/queue/{job['id']}/result",
                      {"status": "failed", "error": "некорректный номер"})
            return
        s = CallSession(job["id"], job["phone"])
        self.active = s
        log(f"задание {job['id']}: набираю {mask_phone(digits)}")
        try:
            self.ctl.send("dial", f"sip:{digits}@{SIP_SERVER}")
        except OSError as e:
            log(f"dial не ушёл: {e}")
            s.result = "failed"
            self.finalize(s)

    # -- режимы ---------------------------------------------------------------

    def run_service(self) -> None:
        if not self.connect():
            keep_alive("baresip (ctrl_tcp) недоступен — проверьте юнит safesky-baresip")
        self.check_registered()
        log(f"цикл опроса очереди запущен (интервал {POLL_INTERVAL} c)")
        while True:
            self.tick()
            time.sleep(0.5 if self.active else POLL_INTERVAL)

    def run_once(self, phone: str) -> int:
        if not self.connect(attempts=5):
            log("ctrl_tcp недоступен")
            return 2
        deadline = time.time() + REG_TIMEOUT
        self.check_registered()
        while self.registered is not True and time.time() < deadline:
            self.drain_events()
            time.sleep(2.0)
            self.check_registered()
        if self.registered is not True:
            log("SIP-регистрация НЕ подтвердилась")
            return 2
        digits = normalize_phone(phone)
        s = CallSession(None, phone)
        self.active = s
        self.ctl.send("dial", f"sip:{digits}@{SIP_SERVER}")
        log(f"вызываю {mask_phone(digits)} через {SIP_SERVER}")
        while s.result is None:
            self.drain_events()
            self.tick()
            time.sleep(0.5)
        log(f"результат: {s.result}")
        return 0 if s.result == "delivered" else 1


# --- очередь Render (HTTP) — контракт без изменений --------------------------

def http_json(method: str, url: str, payload: dict | None = None):
    """HTTP-запрос к очереди. 204 (пустая очередь) → None."""
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {WORKER_TOKEN}")
    data = None
    if payload is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(payload).encode()
    with urllib.request.urlopen(req, data, timeout=15) as r:
        if r.status == 204:
            return None
        return json.loads(r.read().decode() or "null")


def poll_queue():
    """Один заход в очередь: клейм задания (GET /queue/poll) → job или None."""
    url = f"{QUEUE_BASE_URL}/api/test-call/queue/poll?worker={socket.gethostname()}"
    res = http_json("GET", url)
    if not res or not res.get("job"):
        return None
    return res["job"]


def keep_alive(reason: str) -> None:
    """Держать сервис активным, пока конфигурация неполная.

    Согласовано (SAF-235): воркер не падает и не crash-loop'ит при неполной
    конфигурации — спит и ждёт обновления /etc/safesky-softphone/env
    (systemd-перезапуск после обновления). В --once режиме, наоборот, выход
    с кодом ошибки — это разовая ручная проверка.
    """
    log(f"{reason}; сервис остаётся активным, жду обновления /etc/safesky-softphone/env")
    while True:
        time.sleep(3600)


def main() -> int:
    global AUDIO_FILE
    ap = argparse.ArgumentParser(description="SafeSky softphone worker (baresip+ctrl_tcp, Plusofon SIP)")
    ap.add_argument("--once", action="store_true", help="разовый звонок и выход (проверка без очереди)")
    ap.add_argument("--phone", help="номер для --once: 79991234567")
    ap.add_argument("--wav", default=AUDIO_FILE, help="WAV для воспроизведения")
    args = ap.parse_args()
    AUDIO_FILE = args.wav

    if not SIP_LOGIN or not SIP_PASSWORD or not SIP_SERVER:
        if args.once:
            log("SIP_LOGIN / SIP_PASSWORD / SIP_SERVER не заданы (см. /etc/safesky-softphone/env)")
            return 2
        keep_alive("SIP_LOGIN / SIP_PASSWORD / SIP_SERVER не заданы")

    try:
        wav_duration(AUDIO_FILE)
    except Exception as e:  # noqa: BLE001
        if args.once:
            log(f"AUDIO_FILE недоступен: {e}")
            return 2
        keep_alive(f"AUDIO_FILE недоступен: {e}")

    if not args.once and (not QUEUE_BASE_URL or not WORKER_TOKEN):
        keep_alive("QUEUE_BASE_URL / WORKER_TOKEN не заданы — очередь недоступна")

    worker = Worker()
    if args.once:
        if not args.phone:
            ap.error("--once требует --phone")
        return worker.run_once(args.phone)
    worker.run_service()
    return 0


if __name__ == "__main__":
    sys.exit(main())
