// Тесты маршрутов тестового прозвонка (SAF-234/235, очередь SIP-воркера):
// POST /api/test-call — авторизация, постановка в очередь, лимит «3 за 10 минут»;
// GET /queue/poll — токен воркера, клейм, пустая очередь, гонка двух воркеров;
// POST /queue/:id/result — терминальный статус, иммутабельность (SAF-198).
import express from "express";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/error";
import testCallRouter from "./test-call";

const USER_ID = "user-1";

// Моки и env застаблены ДО статических импортов выше: vi.mock/vi.hoisted
// всплывают наверх файла, поэтому роутер получает мок-БД, а config —
// тестовый env (в песочнице NODE_ENV=production, в проде без секретов
// конфиг падает).
const { dbUserFindUnique, dbCallJobCreate, dbCallJobFindFirst, dbCallJobUpdateMany, TEST_SECRET, WORKER_TOKEN } =
  vi.hoisted(() => ({
    dbUserFindUnique: vi.fn(),
    dbCallJobCreate: vi.fn(),
    dbCallJobFindFirst: vi.fn(),
    dbCallJobUpdateMany: vi.fn(),
    TEST_SECRET: "test-jwt-secret",
    WORKER_TOKEN: "test-worker-token",
  }));
vi.mock("../db", () => ({
  db: {
    user: { findUnique: dbUserFindUnique },
    callJob: {
      create: dbCallJobCreate,
      findFirst: dbCallJobFindFirst,
      updateMany: dbCallJobUpdateMany,
    },
  },
}));
vi.hoisted(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", TEST_SECRET);
  vi.stubEnv("WORKER_TOKEN", WORKER_TOKEN);
});

let server: Server;
let baseUrl: string;

function tokenFor(userId: string): string {
  return jwt.sign({}, TEST_SECRET, { subject: userId, expiresIn: 3600 });
}

function authHeader(userId: string): Record<string, string> {
  return { Authorization: `Bearer ${tokenFor(userId)}` };
}

function workerHeader(): Record<string, string> {
  return { Authorization: `Bearer ${WORKER_TOKEN}` };
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

  it("ставит задание в очередь и отдаёт 202 queued", async () => {
    dbUserFindUnique.mockResolvedValue({ id: USER_ID, phone: "+79991234567" });
    dbCallJobCreate.mockResolvedValue({ id: "job-1", status: "pending" });

    const res = await fetch(`${baseUrl}/api/test-call`, {
      method: "POST",
      headers: authHeader(USER_ID),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, status: "queued", jobId: "job-1" });
    expect(dbCallJobCreate).toHaveBeenCalledWith({
      data: { userId: USER_ID, phone: "+79991234567" },
    });
  });

  it("пользователь не найден — 401", async () => {
    dbUserFindUnique.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/test-call`, {
      method: "POST",
      headers: authHeader(USER_ID),
    });

    expect(res.status).toBe(401);
    expect(dbCallJobCreate).not.toHaveBeenCalled();
  });

  it("лимит: 4-й запрос за 10 минут — 429 TEST_CALL_TOO_OFTEN", async () => {
    dbUserFindUnique.mockResolvedValue({ id: USER_ID, phone: "+79991234567" });
    dbCallJobCreate.mockResolvedValue({ id: "job-1", status: "pending" });

    let last = null;
    for (let i = 0; i < 4; i += 1) {
      last = await fetch(`${baseUrl}/api/test-call`, {
        method: "POST",
        headers: authHeader(USER_ID),
      });
    }
    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
    expect(await last!.json()).toMatchObject({ error: "TEST_CALL_TOO_OFTEN" });
  });
});

describe("GET /api/test-call/queue/poll", () => {
  it("без токена воркера — 401", async () => {
    const res = await fetch(`${baseUrl}/api/test-call/queue/poll`);
    expect(res.status).toBe(401);
  });

  it("с неверным токеном воркера — 401", async () => {
    const res = await fetch(`${baseUrl}/api/test-call/queue/poll`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("пустая очередь — 204 без тела", async () => {
    dbCallJobFindFirst.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/test-call/queue/poll`, {
      headers: workerHeader(),
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(dbCallJobUpdateMany).toHaveBeenCalledTimes(1); // только возврат «зависших» ringing
  });

  it("клеймит старейшее pending и отдаёт задание", async () => {
    dbCallJobFindFirst.mockResolvedValue({ id: "job-1", phone: "+79991234567", status: "pending" });
    dbCallJobUpdateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/api/test-call/queue/poll?worker=softphone-01`, {
      headers: workerHeader(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job: { id: "job-1", phone: "+79991234567" } });
    // 1 — возврат «зависших», 2 — клейм с guard'ом status=pending.
    expect(dbCallJobUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "job-1", status: "pending" },
      data: { status: "ringing", worker: "softphone-01" },
    });
  });

  it("гонка двух воркеров: задание уже клеймнуто — 204", async () => {
    dbCallJobFindFirst.mockResolvedValue({ id: "job-1", phone: "+79991234567", status: "pending" });
    dbCallJobUpdateMany.mockResolvedValue({ count: 0 });

    const res = await fetch(`${baseUrl}/api/test-call/queue/poll`, {
      headers: workerHeader(),
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});

describe("POST /api/test-call/queue/:id/result", () => {
  it("без токена воркера — 401", async () => {
    const res = await fetch(`${baseUrl}/api/test-call/queue/job-1/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delivered" }),
    });
    expect(res.status).toBe(401);
  });

  it("delivered — терминальный статус записан", async () => {
    dbCallJobUpdateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/api/test-call/queue/job-1/result`, {
      method: "POST",
      headers: { ...workerHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delivered" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [{ where, data }] = dbCallJobUpdateMany.mock.calls.at(-1)!;
    expect(where).toEqual({ id: "job-1", status: "ringing" });
    expect(data).toMatchObject({ status: "delivered", error: null, completedAt: expect.any(Date) });
  });

  it("failed с текстом ошибки — записан", async () => {
    dbCallJobUpdateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(`${baseUrl}/api/test-call/queue/job-1/result`, {
      method: "POST",
      headers: { ...workerHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed", error: "нет ответа" }),
    });

    expect(res.status).toBe(200);
    const [{ data }] = dbCallJobUpdateMany.mock.calls.at(-1)!;
    expect(data).toMatchObject({ status: "failed", error: "нет ответа" });
  });

  it("некорректный статус — 400 BAD_STATUS", async () => {
    const res = await fetch(`${baseUrl}/api/test-call/queue/job-1/result`, {
      method: "POST",
      headers: { ...workerHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ringing" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "BAD_STATUS" });
  });

  it("повторная запись результата не откатывает завершённое (SAF-198) — 404", async () => {
    dbCallJobUpdateMany.mockResolvedValue({ count: 0 });

    const res = await fetch(`${baseUrl}/api/test-call/queue/job-1/result`, {
      method: "POST",
      headers: { ...workerHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delivered" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "JOB_NOT_FOUND" });
  });
});
