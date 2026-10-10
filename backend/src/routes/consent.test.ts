// Тесты согласия на автоматические вызовы (SAF-244, G-CALL-3/G-CALL-4):
// POST /api/auth/verify-code — запись-доказательство grant при регистрации
//   (номер, время, IP, UA, textId/textVersion, канал) + fail-closed без флага;
// PATCH /api/settings — revoke при отказе + снятие заданий из очереди,
//   grant при повторном включении, отсутствие записей при no-op.
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error";
import authRouter from "./auth";
import settingsRouter from "./settings";

const USER_ID = "user-1";
const PHONE = "+79991234567";

// Моки и env застаблены ДО статических импортов выше (см. test-call.test.ts):
// роутеры получают мок-БД (транзакция исполняет колбэк с мок-клиентом TX),
// а config — тестовый env.
const { TX, dbTransaction, verifyCodeMock, TEST_SECRET } = vi.hoisted(() => {
  const TX = {
    callConsent: { create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    callJob: { updateMany: vi.fn() },
  };
  return {
    TX,
    dbTransaction: vi.fn(async (cb: (tx: typeof TX) => Promise<unknown>) => cb(TX)),
    verifyCodeMock: vi.fn(),
    TEST_SECRET: "test-jwt-secret",
  };
});
vi.mock("../db", () => ({
  db: { $transaction: dbTransaction },
}));
vi.mock("../auth/codes", () => ({
  issueCode: vi.fn(),
  resolveFlashCall: vi.fn(),
  verifyCode: verifyCodeMock,
}));
vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", TEST_SECRET);
});

let server: Server;
let baseUrl: string;

function tokenFor(userId: string): string {
  return jwt.sign({}, TEST_SECRET, { subject: userId, expiresIn: 3600 });
}

function authHeader(userId: string): Record<string, string> {
  return { Authorization: `Bearer ${tokenFor(userId)}` };
}

function user(callsEnabled: boolean) {
  return {
    id: USER_ID,
    phone: PHONE,
    airport: "DME",
    callsEnabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/settings", settingsRouter);
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/verify-code — согласие при регистрации (G-CALL-3)", () => {
  it("callsConsent:true → запись grant со всеми полями доказательства", async () => {
    verifyCodeMock.mockResolvedValue({ user: user(true), created: true });
    TX.callConsent.create.mockResolvedValue({});

    const res = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "test-browser/1.0" },
      body: JSON.stringify({ phone: PHONE, code: "1234", callsConsent: true }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, user: { phone: PHONE, callsEnabled: true } });
    expect(verifyCodeMock).toHaveBeenCalledWith(TX, TEST_SECRET, PHONE, "1234", { callsConsent: true });
    expect(TX.callConsent.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        phone: PHONE,
        action: "grant",
        textId: "call-consent-auto-calls-ru",
        textVersion: 1,
        ip: expect.any(String),
        userAgent: "test-browser/1.0",
        channel: "web_form",
      },
    });
  });

  it("без флага callsConsent → запись согласия НЕ создаётся (fail-closed)", async () => {
    verifyCodeMock.mockResolvedValue({ user: user(false), created: true });

    const res = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE, code: "1234" }),
    });

    expect(res.status).toBe(200);
    expect(verifyCodeMock).toHaveBeenCalledWith(TX, TEST_SECRET, PHONE, "1234", { callsConsent: false });
    expect(TX.callConsent.create).not.toHaveBeenCalled();
  });

  it("callsConsent не boolean → 400 INVALID_BODY", async () => {
    const res = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE, code: "1234", callsConsent: "yes" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_BODY" });
    expect(verifyCodeMock).not.toHaveBeenCalled();
  });

  it("повторный вход (created:false) с callsConsent:true → согласие не перезаписывается", async () => {
    verifyCodeMock.mockResolvedValue({ user: user(true), created: false });

    const res = await fetch(`${baseUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: PHONE, code: "1234", callsConsent: true }),
    });

    expect(res.status).toBe(200);
    expect(TX.callConsent.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/settings — отказ и повторное согласие (G-CALL-4)", () => {
  it("отказ (true→false): запись revoke + снятие pending/ringing заданий", async () => {
    TX.user.findUnique.mockResolvedValue(user(true));
    TX.user.update.mockResolvedValue(user(false));
    TX.callJob.updateMany.mockResolvedValue({ count: 2 });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { ...authHeader(USER_ID), "Content-Type": "application/json", "User-Agent": "test-browser/1.0" },
      body: JSON.stringify({ callsEnabled: false }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { callsEnabled: false } });
    expect(TX.callConsent.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        phone: PHONE,
        action: "revoke",
        textId: null,
        textVersion: null,
        ip: expect.any(String),
        userAgent: "test-browser/1.0",
        channel: "lk",
      },
    });
    expect(TX.callJob.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: { in: ["pending", "ringing"] } },
      data: { status: "cancelled", completedAt: expect.any(Date) },
    });
  });

  it("повторное согласие (false→true) в ЛК: запись grant, очередь не трогаем", async () => {
    TX.user.findUnique.mockResolvedValue(user(false));
    TX.user.update.mockResolvedValue(user(true));

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { ...authHeader(USER_ID), "Content-Type": "application/json" },
      body: JSON.stringify({ callsEnabled: true }),
    });

    expect(res.status).toBe(200);
    expect(TX.callConsent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "grant", textId: "call-consent-auto-calls-ru", textVersion: 1, channel: "lk" }),
    });
    expect(TX.callJob.updateMany).not.toHaveBeenCalled();
  });

  it("no-op (false→false): записи согласия нет, задания не трогаем", async () => {
    TX.user.findUnique.mockResolvedValue(user(false));
    TX.user.update.mockResolvedValue(user(false));

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { ...authHeader(USER_ID), "Content-Type": "application/json" },
      body: JSON.stringify({ callsEnabled: false }),
    });

    expect(res.status).toBe(200);
    expect(TX.callConsent.create).not.toHaveBeenCalled();
    expect(TX.callJob.updateMany).not.toHaveBeenCalled();
  });

  it("смена аэропорта без тумблера: записи согласия нет", async () => {
    TX.user.findUnique.mockResolvedValue(user(true));
    TX.user.update.mockResolvedValue({ ...user(true), airport: "LED" });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { ...authHeader(USER_ID), "Content-Type": "application/json" },
      body: JSON.stringify({ airport: "LED" }),
    });

    expect(res.status).toBe(200);
    expect(TX.callConsent.create).not.toHaveBeenCalled();
    expect(TX.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { airport: "LED" } });
  });
});
