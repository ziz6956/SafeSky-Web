#!/usr/bin/env python3
"""SAF-234/235: софтфон-воркер (pjsua2) — тестовый прозвон через Plusofon.

SIP-регистрация в Plusofon → исходящий звонок → воспроизведение WAV → сброс.
Источник заданий — очередь Render (HTTP-эндпоинты /api/test-call/queue/*;
прямого подключения к Render Postgres извне нет — free-тариф). Разовая
проверка без очереди:

    python3 worker.py --once --phone 79991234567

Переменные окружения (все секреты — в /etc/safesky-softphone/env, см. Ansible):
  SIP_LOGIN, SIP_PASSWORD     — учётные данные SIP-аккаунта Plusofon
  SIP_SERVER, SIP_PORT        — <аккаунт>.voice.plusofon.ru:5060 по умолчанию
  SIP_LOCAL_PORT              — локальный UDP-порт (5060)
  AUDIO_FILE                  — WAV для воспроизведения
  QUEUE_BASE_URL              — базовый URL бэкенда Render (https://safesky-web.onrender.com)
  WORKER_TOKEN                — Bearer-токен эндпоинтов очереди (WORKER_TOKEN на Render)
  POLL_INTERVAL, REG_TIMEOUT  — интервал опроса / таймаут регистрации (сек)
"""

import argparse
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.request
import wave

import pjsua2 as pj

AUDIO_FILE = os.environ.get("AUDIO_FILE", "/opt/safesky-softphone/audio/test-call-ru.wav")
SIP_SERVER = os.environ.get("SIP_SERVER", "sip.plusofon.ru")
SIP_PORT = int(os.environ.get("SIP_PORT", "5060"))
SIP_LOCAL_PORT = int(os.environ.get("SIP_LOCAL_PORT", "5060"))
SIP_LOGIN = os.environ.get("SIP_LOGIN", "")
SIP_PASSWORD = os.environ.get("SIP_PASSWORD", "")
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "2.0"))
REG_TIMEOUT = float(os.environ.get("REG_TIMEOUT", "30.0"))
REG_RETRY_SEC = int(os.environ.get("REG_RETRY_SEC", "300"))
CALL_TIMEOUT = int(os.environ.get("CALL_TIMEOUT", "30"))  # таймаут дозвона, сек

# Очередь Render (SAF-235): вместо Supabase воркер ходит в HTTP-эндпоинты
# бэкенда — GET /api/test-call/queue/poll (клейм задания) и
# POST /api/test-call/queue/<id>/result (терминальный статус).
QUEUE_BASE_URL = os.environ.get("QUEUE_BASE_URL", "")
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def wav_duration(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def mask_phone(phone: str) -> str:
    """+7 (9**) ***-**-99 — номер не должен попадать в журнал в открытом виде (SAF-246).

    Журнал воркера — на не-РФ хосте (Hetzner, fsn1); ч. 5 ст. 18 152-ФЗ запрещает
    накопление ПДн граждан РФ вне территории РФ, поэтому в service-журнал уходит
    только маска. Функция не бросает исключений: она же маскирует номера,
    которые не прошли normalize_phone.
    """
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) < 4:
        return "***"
    return f"+{digits[0]} ({digits[1]}**) ***-**-{digits[-2:]}"


_PHONE_RE = re.compile(r"\b[78]\d{10}\b")


def redact(text: str) -> str:
    """Маскировать любые 11-значные номера (7XXXXXXXXXX / 8XXXXXXXXXX) в тексте.

    Тексты исключений pjsua2 могут включать Request-URI; перечислить все такие
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


class PlayCall(pj.Call):
    """Исходящий звонок: по ответу проигрывает WAV и сбрасывается по таймеру."""

    def __init__(self, acc: pj.Account, wav_path: str):
        pj.Call.__init__(self, acc)
        self.wav_path = wav_path
        self.played = False
        self.result = None  # 'delivered' | 'failed'
        # ВАЖНО: pjsua2-python уничтожает объекты без ссылок — держим явно.
        self.player = None
        self.timer = None

    def onCallState(self, prm) -> None:
        ci = self.getInfo()
        if ci.state == pj.PJSIP_INV_STATE_DISCONNECTED:
            log(f"звонок завершён, последний код: {ci.lastStatusCode}")
            if self.result is None:
                self.result = "delivered" if self.played else "failed"

    def onCallMediaState(self, prm) -> None:
        if self.played:
            return
        ci = self.getInfo()
        for mi in ci.media:
            if mi.type == pj.PJMEDIA_TYPE_AUDIO and mi.status == pj.PJSUA_CALL_MEDIA_ACTIVE:
                audio = self.getAudioMedia(mi.index)
                self.player = pj.AudioMediaPlayer()
                self.player.createPlayer(self.wav_path, pj.PJMEDIA_FILE_NO_LOOP)
                self.player.startTransmit(audio)
                self.played = True
                duration = wav_duration(self.wav_path)
                hang_after = duration + 1.5
                log(f"воспроизвожу {self.wav_path} ({duration:.1f} c); сброс через {hang_after:.1f} c")
                self.timer = threading.Timer(hang_after, self._hangup)
                self.timer.start()
                break

    def _hangup(self) -> None:
        if self.isActive():
            try:
                self.hangup(pj.CallOpParam())
            except Exception:
                pass


def create_account() -> pj.AccountConfig:
    if not SIP_LOGIN or not SIP_PASSWORD:
        raise RuntimeError("SIP_LOGIN / SIP_PASSWORD не заданы (см. /etc/safesky-softphone/env)")
    acfg = pj.AccountConfig()
    # логин может быть и «1234», и «1234@sip.plusofon.ru» — приводим к URI
    if "@" in SIP_LOGIN:
        acfg.idUri = f"sip:{SIP_LOGIN}"
    else:
        acfg.idUri = f"sip:{SIP_LOGIN}@{SIP_SERVER}"
    acfg.regConfig.registrarUri = f"sip:{SIP_SERVER}:{SIP_PORT}"
    acfg.regConfig.timeoutSec = 300
    user = SIP_LOGIN.split("@")[0]
    acfg.sipConfig.authCreds.append(pj.AuthCredInfo("digest", "*", user, 0, SIP_PASSWORD))
    outbound = os.environ.get("SIP_OUTBOUND_PROXY", "")
    if outbound:
        acfg.sipConfig.proxies.append(outbound)
    return acfg


def init_endpoint() -> pj.Endpoint:
    ep_cfg = pj.EpConfig()
    ep_cfg.uaConfig.maxCalls = 1  # прототип: 1 одновременный звонок
    ep_cfg.logConfig.level = 4
    ep_cfg.logConfig.consoleLevel = 2
    # SAF-246: дамп SIP-сообщений печатает INVITE с Request-URI, то есть номер
    # в открытом виде, в stdout → journald на не-РФ хосте. Выключаем дамп.
    ep_cfg.logConfig.msgLogging = 0
    ep = pj.Endpoint()
    ep.libCreate()
    ep.libInit(ep_cfg)
    tcfg = pj.TransportConfig()
    tcfg.port = SIP_LOCAL_PORT
    ep.transportCreate(pj.PJSIP_TRANSPORT_UDP, tcfg)
    ep.libStart()
    return ep


def wait_registration(acc: pj.Account, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = acc.getInfo()
        if info.regIsActive:
            log("SIP-регистрация активна")
            return True
        time.sleep(1)
    info = acc.getInfo()
    log(f"SIP-регистрация НЕ подтвердилась (status={info.regStatus}, err={info.regLastErr})")
    return False


def make_test_call(acc: pj.Account, phone: str, wav_path: str) -> PlayCall:
    digits = normalize_phone(phone)
    uri = f"sip:{digits}@{SIP_SERVER}"
    call = PlayCall(acc, wav_path)
    prm = pj.CallOpParam()
    prm.timeoutSec = CALL_TIMEOUT
    log(f"вызываю {mask_phone(digits)} через {SIP_SERVER}")
    call.makeCall(uri, prm)
    return call


def wait_call_result(call: PlayCall, max_wait: float = 120.0) -> str:
    deadline = time.time() + max_wait
    while time.time() < deadline and call.result is None:
        time.sleep(1)
    if call.result is None:
        call._hangup()
        return "failed"
    return call.result


# --- очередь Render (HTTP) --------------------------------------------------

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


def poll_once(acc: pj.Account) -> bool:
    """Один заход в очередь: клейм задания, звонок, запись результата."""
    url = f"{QUEUE_BASE_URL}/api/test-call/queue/poll?worker={socket.gethostname()}"
    res = http_json("GET", url)
    if not res or not res.get("job"):
        return False
    job = res["job"]
    log(f"задание {job['id']}: набираю {mask_phone(job['phone'])}")
    try:
        call = make_test_call(acc, job["phone"], AUDIO_FILE)
        result = wait_call_result(call)
    except Exception as e:  # noqa: BLE001 — статус пишем в очередь при любой ошибке
        log(f"ошибка звонка: {redact(str(e))}")
        result = "failed"
    payload = {"status": result}
    if result == "failed":
        payload["error"] = "см. журнал воркера"
    try:
        http_json("POST", f"{QUEUE_BASE_URL}/api/test-call/queue/{job['id']}/result", payload)
    except Exception as e:  # noqa: BLE001 — задание вернётся в очередь по stale-таймауту
        log(f"не удалось записать результат: {e}")
    log(f"задание {job['id']}: {result}")
    return True


def keep_alive(reason: str) -> None:
    """Держать сервис активным, пока конфигурация неполная.

    Согласовано (SAF-235): воркер не падает и не crash-loop'ит при отсутствии
    SIP-кредов или очереди — спит и ждёт обновления /etc/safesky-softphone/env
    (systemd-перезапуск после обновления). В --once режиме, наоборот, выход
    с кодом ошибки — это разовая ручная проверка.
    """
    log(f"{reason}; сервис остаётся активным, жду обновления /etc/safesky-softphone/env")
    while True:
        time.sleep(3600)


def main() -> int:
    ap = argparse.ArgumentParser(description="SafeSky softphone worker (pjsua2, Plusofon SIP)")
    ap.add_argument("--once", action="store_true", help="разовый звонок и выход (проверка без очереди)")
    ap.add_argument("--phone", help="номер для --once: 79991234567")
    ap.add_argument("--wav", default=AUDIO_FILE, help="WAV для воспроизведения")
    args = ap.parse_args()

    if not SIP_LOGIN or not SIP_PASSWORD:
        if args.once:
            log("SIP_LOGIN / SIP_PASSWORD не заданы (см. /etc/safesky-softphone/env)")
            return 2
        keep_alive("SIP_LOGIN / SIP_PASSWORD не заданы")

    ep = init_endpoint()
    try:
        acc = pj.Account()
        acc.create(create_account())
        while not wait_registration(acc, REG_TIMEOUT):
            if args.once:
                return 2
            log(f"регистрация не подтвердилась; повтор через {REG_RETRY_SEC} с")
            time.sleep(REG_RETRY_SEC)
            try:
                acc.setRegister(True)
            except Exception:
                return 2

        if args.once:
            if not args.phone:
                ap.error("--once требует --phone")
            call = make_test_call(acc, args.phone, args.wav)
            result = wait_call_result(call)
            log(f"результат: {result}")
            return 0 if result == "delivered" else 1

        if not QUEUE_BASE_URL or not WORKER_TOKEN:
            keep_alive("QUEUE_BASE_URL / WORKER_TOKEN не заданы — очередь недоступна")

        log(f"цикл опроса очереди запущен ({QUEUE_BASE_URL}, интервал {POLL_INTERVAL} c)")
        while True:
            try:
                poll_once(acc)
            except Exception as e:  # noqa: BLE001 — воркер обязан жить
                log(f"ошибка цикла: {e}")
            time.sleep(POLL_INTERVAL)
    finally:
        ep.libDestroy()
    return 0


if __name__ == "__main__":
    sys.exit(main())
