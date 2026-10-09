#!/usr/bin/env python3
"""SAF-234: софтфон-воркер (pjsua2) — тестовый прозвон через Plusofon.

SIP-регистрация в Plusofon → исходящий звонок → воспроизведение WAV → сброс.
Источник заданий — очередь Supabase (таблица call_queue); либо разовая проверка:

    python3 worker.py --once --phone 79991234567

Переменные окружения (все секреты — в /etc/safesky-softphone/env, см. Ansible):
  SIP_LOGIN, SIP_PASSWORD     — учётные данные SIP-аккаунта Plusofon
  SIP_SERVER, SIP_PORT        — sip.plusofon.ru:5060 по умолчанию
  SIP_LOCAL_PORT              — локальный UDP-порт (5060)
  AUDIO_FILE                  — WAV для воспроизведения
  SUPABASE_URL, SUPABASE_SERVICE_KEY — очередь call_queue
  POLL_INTERVAL, REG_TIMEOUT  — интервал опроса / таймаут регистрации (сек)
"""

import argparse
import json
import os
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
CALL_TIMEOUT = int(os.environ.get("CALL_TIMEOUT", "30"))  # таймаут дозвона, сек

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
QUEUE_TABLE = os.environ.get("QUEUE_TABLE", "call_queue")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def wav_duration(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def normalize_phone(phone: str) -> str:
    """79991234567 — международный формат без '+'."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if len(digits) != 11 or not digits.startswith("7"):
        raise ValueError(f"номер не в формате 79XXXXXXXXX: {phone!r}")
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
    log(f"вызываю {digits} через {SIP_SERVER}")
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


# --- очередь Supabase -----------------------------------------------------

def http_json(method: str, url: str, payload: dict | None = None):
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Content-Type", "application/json")
    data = json.dumps(payload).encode() if payload is not None else None
    with urllib.request.urlopen(req, data, timeout=15) as r:
        return json.loads(r.read().decode() or "[]")


def poll_once(acc: pj.Account) -> bool:
    """Один заход в очередь: взять pending-задание, позвонить, записать статус."""
    url = f"{SUPABASE_URL}/rest/v1/{QUEUE_TABLE}?status=eq.pending&order=created_at.asc&limit=1"
    rows = http_json("GET", url)
    if not rows:
        return False
    job = rows[0]
    job_id = job["id"]
    http_json("PATCH", f"{SUPABASE_URL}/rest/v1/{QUEUE_TABLE}?id=eq.{job_id}",
              {"status": "ringing", "worker": os.uname().nodename})
    try:
        call = make_test_call(acc, job["phone"], AUDIO_FILE)
        result = wait_call_result(call)
    except Exception as e:  # noqa: BLE001 — статус пишем в очередь при любой ошибке
        log(f"ошибка звонка: {e}")
        result = "failed"
    patch = {"status": result, "completed_at": "now()"}
    if result == "failed":
        patch["error"] = "см. журнал воркера"
    http_json("PATCH", f"{SUPABASE_URL}/rest/v1/{QUEUE_TABLE}?id=eq.{job_id}", patch)
    log(f"задание {job_id}: {result}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="SafeSky softphone worker (pjsua2, Plusofon SIP)")
    ap.add_argument("--once", action="store_true", help="разовый звонок и выход (проверка без очереди)")
    ap.add_argument("--phone", help="номер для --once: 79991234567")
    ap.add_argument("--wav", default=AUDIO_FILE, help="WAV для воспроизведения")
    args = ap.parse_args()

    ep = init_endpoint()
    try:
        acc = pj.Account()
        acc.create(create_account())
        if not wait_registration(acc, REG_TIMEOUT):
            return 2

        if args.once:
            if not args.phone:
                ap.error("--once требует --phone")
            call = make_test_call(acc, args.phone, args.wav)
            result = wait_call_result(call)
            log(f"результат: {result}")
            return 0 if result == "delivered" else 1

        if not SUPABASE_URL or not SUPABASE_KEY:
            log("SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы — очередь недоступна")
            return 2

        log(f"цикл опроса очереди запущен (интервал {POLL_INTERVAL} c)")
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
