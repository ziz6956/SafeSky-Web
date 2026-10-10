#!/usr/bin/env python3
"""SAF-234: создание/настройка SIP-аккаунта Plusofon для софтфона (API v1).

По указанию основателя SIP-аккаунт создаётся самими агентами через API:
  PUT    /api/v1/sip          — создать аккаунт (name, role, aon, sip_timeout...)
  PATCH  /api/v1/sip/{id}     — установить пароль
  GET    /api/v1/sip          — список аккаунтов (поиск уже созданного)

Авторизация: PLUSOFON_API_TOKEN (Bearer) + заголовок Client: 10553.
Секреты в stdout НЕ печатаются (пароль маскируется).

Запускается Ansible-плейбуком при развёртывании.
"""

import json
import os
import secrets
import sys
import urllib.request

BASE = "https://restapi.plusofon.ru/api/v1"
CLIENT = "10553"
TOKEN = os.environ.get("PLUSOFON_API_TOKEN", "")
ACCOUNT_NAME = os.environ.get("SIP_ACCOUNT_NAME", "safesky-softphone")
PASSWORD = os.environ.get("SIP_PASSWORD", "")


def http(method: str, path: str, payload: dict | None = None) -> dict:
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Client", CLIENT)
    req.add_header("Content-Type", "application/json")
    data = json.dumps(payload).encode() if payload is not None else None
    with urllib.request.urlopen(req, data, timeout=30) as r:
        body = r.read().decode() or "{}"
    return json.loads(body)


def as_list(resp: dict) -> list:
    """Ответы API v1 бывают и списком, и обёрткой {data: [...], result: ...}."""
    if isinstance(resp, list):
        return resp
    for key in ("data", "result", "items"):
        v = resp.get(key)
        if isinstance(v, list):
            return v
    return []


def mask(text: str, secret: str) -> str:
    return text.replace(secret, "***") if secret else text


def main() -> int:
    if not TOKEN:
        print("нет PLUSOFON_API_TOKEN", file=sys.stderr)
        return 2

    # 1. Ищем существующий аккаунт по имени (идемпотентность)
    sips = as_list(http("GET", "/sip"))
    existing = next((s for s in sips if s.get("name") == ACCOUNT_NAME), None)
    if existing:
        sip_id = existing.get("id")
        print(f"SIP-аккаунт «{ACCOUNT_NAME}» уже существует: id={sip_id}")
    else:
        numbers = as_list(http("GET", "/number"))
        aon = numbers[0].get("id") if numbers else None
        payload = {
            "name": ACCOUNT_NAME,
            "role": "софтфон SafeSky (тестовый прозвон)",
            "sip_timeout": 30,
            "sequence_rule": "single",
        }
        if aon is not None:
            payload["aon"] = aon
        created = http("PUT", "/sip", payload)
        print(f"создан SIP-аккаунт: {mask(json.dumps(created, ensure_ascii=False), PASSWORD)}")
        sip_id = created.get("id")
        if sip_id is None and isinstance(created.get("data"), dict):
            sip_id = created["data"].get("id")

    if not sip_id:
        print("не удалось определить id SIP-аккаунта — см. ответ выше", file=sys.stderr)
        return 2

    # 2. Пароль: из env или генерируем (в выводе не печатается)
    password = PASSWORD or secrets.token_urlsafe(12)
    patched = http("PATCH", f"/sip/{sip_id}", {"password": password})
    print(f"пароль SIP-аккаунта установлен (id={sip_id}); ответ: "
          f"{mask(json.dumps(patched, ensure_ascii=False), password)}")

    # 3. Логин для воркера (формат зависит от ответа API)
    detail = http("GET", f"/sip/{sip_id}")
    print(f"детали аккаунта: {mask(json.dumps(detail, ensure_ascii=False), password)}")
    if isinstance(detail, dict):
        login = detail.get("login") or detail.get("sip_login") or detail.get("number")
        if login:
            print(f"SIP_LOGIN={login}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
