// Тесты маршрутов авторизации (SAF-300): POST /api/auth/request-code,
// /verify-code, /flash-call/callback.
// Покрывают: успешный запуск Flash Call (202), сбои провайдера (503, НЕ 502 —
// 502 резервируем за ошибками шлюза Render), таймаут провайдера (503),
// полный цикл «запрос кода → ввод 4 цифр → верификация», rate-limiting
// (429 TOO_MANY_REQUESTS), колбэк провайдера (секрет/номер/сопоставление).
// Порядок describe-блоков важен: лимитер request-code (20/15 мин на IP) —
// один на роутер, поэтому пожирающий лимит тест стоит ПОСЛЕДНИМ.
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error";
import { SmsSendError } from "../sms";
import authRouter from "./auth";

// Моки и env застаблены ДО статических импортов: vi.mock/vi.hoisted всплывают
// наверх файла, поэтому роутер получает мок-БД и мок-провайдер, а config —
// тестовый env (в песочнице NODE_ENV=production, без секретов конфиг падает).
const {
  smsCodeFindFirst,
  smsCodeCreate,
  smsCodeUpdate,
  userFindUnique,
  userCreate,
  callConsentCreate,
  fakeProvider,
  TEST_SECRET,
  WEBHOOK_SECRET,
} = vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", "test-jwt-secret");
  vi.stubEnv("PLUSOFON_WEBHOOK_SECRET", "test-webhook-secret");
  return {
    smsCodeFindFirst: vi.fn(),
    smsCodeCreate: vi.fn(),
    smsCodeUpdate: vi.fn(),
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
    callConsentCreate: vi.fn(),
    fakeProvider: {
      name: "plusofon",
      flashCall: vi.fn(),
      send: vi.fn(),
    } as {
      name: string;
      flashCall?: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    },
    TEST_SECRET: "test-jwt-secret",
    WEBHOOK_SECRET: "test-webhook-secret",
  };
});

vi.mock("../sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sms")>();
  return {
    ...actual,
    createSmsProvider: () => fakeProvider as unknown as import("../sms").SmsProvider,
  };
});

vi.mock("../db", () => {
  const db = {
    smsCode: { findFirst: smsCodeFindFirst, create: smsCodeCreate, update: smsCodeUpdate },
    user: { findUnique: userFindUnique, create: userCreate },
    callConsent: { create: callConsentCreate },
    // verify-code оборачивает верификацию в транзакцию; мок исполняет fn
    // на том же объекте — tx = db.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

const PHONE = "+79991234567";

function hashCode(code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

function flashRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c1",
    phone: PHONE,
    callId: "fc-1",
    codeHash: hashCode("1234", TEST_SECRET),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    ...over,
  };
}

let server: Server;
let baseUrl: string;

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

beforeEach(() => {
  smsCodeFindFirst.mockResolvedValue(null);
  smsCodeCreate.mockResolvedValue({ id: "c1" });
  smsCodeUpdate.mockResolvedValue({ id: "c1" });
  userFindUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "u1", phone: PHONE, airport: null, callsEnabled: true });
  callConsentCreate.mockResolvedValue({ id: "cc1" });
  fakeProvider.name = "plusofon";
  fakeProvider.flashCall = vi.fn().mockResolvedValue({ callId: "fc-1", code: "1234" });
  fakeProvider.send = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/request-code — Flash Call", () => {
  it("успешный запуск: 202, код из ответа провайдера, запись в БД", async () => {
    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, resendAfterSec: 30, pending: false });
    expect(fakeProvider.flashCall).toHaveBeenCalledWith(PHONE, "");
    expect(smsCodeCreate).toHaveBeenCalledWith({
      data: {
        phone: PHONE,
        callId: "fc-1",
        codeHash: hashCode("1234", TEST_SECRET),
        expiresAt: expect.any(Date),
      },
    });
  });

  it("некорректный номер — 400 INVALID_PHONE, провайдер не дёргается", async () => {
    const res = await post("/api/auth/request-code", { phone: "12345" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_PHONE" });
    expect(fakeProvider.flashCall).not.toHaveBeenCalled();
    expect(smsCodeCreate).not.toHaveBeenCalled();
  });

  it("провайдер вернул 500 — 503 SMS_SEND_FAILED (НЕ 502), кулдаун не сожжён", async () => {
    fakeProvider.flashCall = vi.fn().mockRejectedValue(new SmsSendError("Plusofon HTTP 500: внутренняя ошибка"));

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(502);
    expect(await res.json()).toMatchObject({
      error: "SMS_SEND_FAILED",
      message: "Сервис временно недоступен — попробуйте позже",
    });
    expect(smsCodeCreate).not.toHaveBeenCalled();
  });

  it("таймаут провайдера — 503 (НЕ 502)", async () => {
    fakeProvider.flashCall = vi.fn().mockRejectedValue(new SmsSendError("Plusofon: таймаут 10 с — провайдер не ответил"));

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(503);
    expect(res.status).not.toBe(502);
    expect(await res.json()).toMatchObject({ error: "SMS_SEND_FAILED" });
  });

  it("провайдер без Flash Call (расконфиг) — 503, не 502", async () => {
    fakeProvider.flashCall = undefined;

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "SMS_SEND_FAILED" });
  });

  it("код неизвестен из ответа (придёт колбэком) — 202 pending=true", async () => {
    fakeProvider.flashCall = vi.fn().mockResolvedValue({ callId: "fc-2", code: null });

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, resendAfterSec: 30, pending: true });
  });

  it("повторная отправка раньше 30 с — 429 RESEND_TOO_SOON с retryAfterSec", async () => {
    smsCodeFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) });

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "RESEND_TOO_SOON", retryAfterSec: 25 });
    expect(fakeProvider.flashCall).not.toHaveBeenCalled();
  });

  it("SMS-ветка (console): 6-значный код, без поля pending", async () => {
    fakeProvider.name = "console";
    fakeProvider.flashCall = undefined;

    const res = await post("/api/auth/request-code", { phone: PHONE });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok?: boolean; pending?: boolean };
    expect(body.ok).toBe(true);
    expect(body.pending).toBeUndefined();
    expect(fakeProvider.send).toHaveBeenCalledTimes(1);
    expect(smsCodeCreate).toHaveBeenCalledWith({
      data: {
        phone: PHONE,
        codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
      },
    });
  });

  it("сломанный JSON в теле — 400 INVALID_JSON", async () => {
    const res = await post("/api/auth/request-code", '{"phone":', { "Content-Type": "application/json" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_JSON" });
  });
});

describe("POST /api/auth/verify-code", () => {
  it("кода нет — 404 CODE_NOT_FOUND", async () => {
    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "1234" });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "CODE_NOT_FOUND" });
  });

  it("неверный формат кода — 400 INVALID_CODE_FORMAT", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow());

    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "12" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_CODE_FORMAT" });
  });

  it("звонок ещё не доставлен — 425 CODE_PENDING, попытки не сгорают", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow({ codeHash: null }));

    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "1234" });

    expect(res.status).toBe(425);
    expect(await res.json()).toMatchObject({ error: "CODE_PENDING" });
    expect(smsCodeUpdate).not.toHaveBeenCalled();
  });

  it("код истёк — 410 CODE_EXPIRED", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow({ expiresAt: new Date(Date.now() - 1_000) }));

    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "1234" });

    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "CODE_EXPIRED" });
  });

  it("попытки исчерпаны — 423 CODE_BLOCKED", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow({ attempts: 3 }));

    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "1234" });

    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ error: "CODE_BLOCKED" });
  });

  it("неверный код — 401 CODE_INVALID с оставшимися попытками", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow());
    smsCodeUpdate.mockResolvedValue({ attempts: 1 });

    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "9999" });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "CODE_INVALID", attemptsLeft: 2 });
  });

  it("callsConsent не boolean — 400 INVALID_BODY", async () => {
    const res = await post("/api/auth/verify-code", { phone: PHONE, code: "1234", callsConsent: "yes" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_BODY" });
  });
});

describe("полный цикл: запрос кода → ввод 4 цифр → верификация (e2e)", () => {
  it("Flash Call: 202 → 4 цифры → 200 с токеном и записью согласия", async () => {
    // Шаг 1: запуск звонка. Код — из ответа провайдера (pin).
    fakeProvider.flashCall = vi.fn().mockResolvedValue({ callId: "fc-e2e", code: "1234" });
    const started = await post("/api/auth/request-code", { phone: PHONE });
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ ok: true, pending: false });

    // Шаг 2: «входящий звонок» доставил код 1234 — верификация.
    smsCodeFindFirst.mockResolvedValue(flashRow({ id: "c-e2e", callId: "fc-e2e" }));
    const verified = await post("/api/auth/verify-code", { phone: PHONE, code: "1234", callsConsent: true });

    expect(verified.status).toBe(200);
    const body = (await verified.json()) as { ok: boolean; token: string; user: unknown };
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({ phone: PHONE, airport: null, callsEnabled: true });

    // Токен подписан для нового пользователя.
    const payload = jwt.verify(body.token, TEST_SECRET) as { sub?: string };
    expect(payload.sub).toBe("u1");

    // Согласие на автозвонки зафиксировано той же транзакцией (SAF-244).
    expect(userCreate).toHaveBeenCalledWith({ data: { phone: PHONE, callsEnabled: true } });
    expect(callConsentCreate).toHaveBeenCalledTimes(1);
  });

  it("без callsConsent пользователь создаётся с вызовами выключенными (fail-closed)", async () => {
    fakeProvider.flashCall = vi.fn().mockResolvedValue({ callId: "fc-e2e", code: "1234" });
    await post("/api/auth/request-code", { phone: PHONE });

    smsCodeFindFirst.mockResolvedValue(flashRow({ id: "c-e2e", callId: "fc-e2e" }));
    const verified = await post("/api/auth/verify-code", { phone: PHONE, code: "1234" });

    expect(verified.status).toBe(200);
    expect(userCreate).toHaveBeenCalledWith({ data: { phone: PHONE, callsEnabled: false } });
    expect(callConsentCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/flash-call/callback", () => {
  it("неверный секрет — 401 UNAUTHORIZED", async () => {
    const res = await post("/api/auth/flash-call/callback?secret=wrong", {
      key: "fc-1",
      caller_number: "74951234567",
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("колбэк без номера звонящего — 400 BAD_REQUEST", async () => {
    const res = await post(`/api/auth/flash-call/callback?secret=${WEBHOOK_SECRET}`, { key: "fc-1" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "BAD_REQUEST" });
  });

  it("нет ожидающей верификации — 404 CODE_NOT_FOUND", async () => {
    smsCodeFindFirst.mockResolvedValue(null);

    const res = await post(`/api/auth/flash-call/callback?secret=${WEBHOOK_SECRET}`, {
      key: "fc-1",
      caller_number: "74951234567",
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "CODE_NOT_FOUND" });
  });

  it("успешный колбэк: код = последние 4 цифры номера звонящего", async () => {
    smsCodeFindFirst.mockResolvedValue(flashRow({ callId: "fc-1", codeHash: null }));

    const res = await post(`/api/auth/flash-call/callback?secret=${WEBHOOK_SECRET}`, {
      key: "fc-1",
      caller_number: "74951234567",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(smsCodeUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { codeHash: hashCode("4567", TEST_SECRET) },
    });
  });
});

describe("rate-limiting: request-code", () => {
  it("21-й запрос за 15 минут — 429 TOO_MANY_REQUESTS (лимит 20 на IP)", async () => {
    // Лимитер один на роутер, поэтому блок идёт последним и «добирает» лимит
    // до исчерпания: часть из 20 могла уйти на тесты выше.
    let last: Response | null = null;
    for (let i = 0; i < 21; i += 1) {
      last = await post("/api/auth/request-code", { phone: PHONE });
    }

    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
    expect(await last!.json()).toMatchObject({ error: "TOO_MANY_REQUESTS" });
  });
});
