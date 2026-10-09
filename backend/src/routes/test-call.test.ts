// Тесты маршрута POST /api/test-call (SAF-234): авторизация, звонок через
// провайдера, лимит «не чаще 3 за 10 минут», ошибки провайдера.
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error";
import testCallRouter from "./test-call";

const USER_ID = "user-1";

// Моки и env застаблены ДО статических импортов выше: vi.mock/vi.hoisted
// всплывают наверх файла, поэтому роутер получает мок-провайдера и мок-БД,
// а config — тестовый env (в песочнице NODE_ENV=production, в проде без
// PLUSOFON_WEBHOOK_SECRET конфиг падает).
const { flashCallMock, dbFindUnique, TEST_SECRET } = vi.hoisted(() => ({
  flashCallMock: vi.fn(),
  dbFindUnique: vi.fn(),
  TEST_SECRET: "test-jwt-secret",
}));
vi.mock("../sms", () => ({
  createSmsProvider: () => ({ name: "plusofon", flashCall: flashCallMock }),
  SmsSendError: class SmsSendError extends Error {},
}));
vi.mock("../db", () => ({
  db: { user: { findUnique: dbFindUnique } },
}));
vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", TEST_SECRET);
  vi.stubEnv("SMS_PROVIDER", "plusofon");
  vi.stubEnv("PLUSOFON_FLASH_CALL_TOKEN", "token");
  vi.stubEnv("PLUSOFON_WEBHOOK_SECRET", "secret");
});

let server: Server;
let baseUrl: string;

function tokenFor(userId: string): string {
  return jwt.sign({}, TEST_SECRET, { subject: userId, expiresIn: 3600 });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/test-call", testCallRouter);
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

describe("POST /api/test-call", () => {
  it("без Bearer-токена — 401 UNAUTHORIZED", async () => {
    const res = await fetch(`${baseUrl}/api/test-call`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("с валидным токеном инициирует Flash Call с фиксированным pin и отдаёт 202", async () => {
    dbFindUnique.mockResolvedValue({ id: USER_ID, phone: "+79991234567" });
    flashCallMock.mockResolvedValue({ callId: "tc-1", code: null });

    const res = await fetch(`${baseUrl}/api/test-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, status: "initiated", callId: "tc-1" });
    // Номер из профиля, код тестового прозвонка — всегда «1234» (SAF-234).
    expect(flashCallMock).toHaveBeenCalledWith("+79991234567", "", "1234");
  });

  it("несуществующий пользователь — 401", async () => {
    dbFindUnique.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/api/test-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor("ghost")}` },
    });
    expect(res.status).toBe(401);
  });

  it("ошибка провайдера — 502 TEST_CALL_FAILED", async () => {
    dbFindUnique.mockResolvedValue({ id: USER_ID, phone: "+79991234567" });
    flashCallMock.mockRejectedValue(new Error("HTTP 403: Forbidden"));
    const res = await fetch(`${baseUrl}/api/test-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(USER_ID)}` },
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "TEST_CALL_FAILED" });
  });

  it("4-й звонок за 10 минут — 429 TEST_CALL_TOO_OFTEN (бюджет канала)", async () => {
    // Отдельный пользователь: лимит считает на userId, а предыдущие тесты
    // уже потратили слоты USER_ID.
    dbFindUnique.mockResolvedValue({ id: "rate-user", phone: "+79991234567" });
    flashCallMock.mockResolvedValue({ callId: "tc-x", code: null });
    const headers = { Authorization: `Bearer ${tokenFor("rate-user")}` };

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${baseUrl}/api/test-call`, { method: "POST", headers });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    const last = await fetch(`${baseUrl}/api/test-call`, { method: "POST", headers });
    expect(await last.json()).toMatchObject({ error: "TEST_CALL_TOO_OFTEN" });
  });
});
