import rateLimit from "express-rate-limit";
import { Router } from "express";
import type { RequestHandler } from "express";
import { config } from "../config";
import { db } from "../db";
import { ApiError } from "../lib/errors";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

// Тестовый прозвон (SAF-234/235): очередь заданий для SIP-воркера (pjsua2).
//
// POST /api/test-call             — пользователь ставит задание в очередь (202).
// GET  /api/test-call/queue/poll  — воркер забирает старейшее pending (клейм).
// POST /api/test-call/queue/:id/result — воркер отдаёт терминальный результат.
//
// Воркер живёт вне Render (Hetzner/РФ-VPS) и не может ходить в Render Postgres
// напрямую (free-тариф, внешних подключений нет) — связка только через эти
// HTTP-эндпоинты. Аутентификация воркера — Bearer WORKER_TOKEN (не JWT).

// Платный канал (пакет голосовых звонков), поэтому лимит на пользователя:
// не более 3 тестовых звонков за 10 минут.
const testCallLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (_req, res) => (res.locals as { userId: string }).userId ?? "anon",
  message: { error: "TEST_CALL_TOO_OFTEN", message: "Слишком часто — подождите пару минут и повторите" },
});

// «Зависшее» ringing-задание (воркер упал между клеймом и результатом)
// возвращается в очередь через это время.
const STALE_RINGING_MS = 5 * 60 * 1000;

const router = Router();

// Токен воркера: если WORKER_TOKEN не настроен (пустой), эндпоинты воркера
// отвечают 401 — воркер видит это в логах, а не «тихо» ломается.
const requireWorker: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !config.workerToken || token !== config.workerToken) {
    return next(new ApiError(401, "UNAUTHORIZED", "Требуется токен воркера"));
  }
  next();
};

// POST / — поставить тестовый звонок в очередь. 202 — принято в очередь.
router.post(
  "/",
  requireAuth,
  testCallLimiter,
  asyncHandler(async (_req, res) => {
    // Без воркера задание зависло бы в очереди навсегда — честный 503 сразу.
    if (!config.workerToken) {
      throw new ApiError(503, "TEST_CALL_UNAVAILABLE", "SIP-воркер не настроен — попробуйте позже");
    }
    const { userId } = res.locals as { userId: string };
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Пользователь не найден — войдите заново");
    }
    // SAF-244 (G-CALL-4): без действующего согласия задания не ставим.
    // callsEnabled=false — отказ абонента (запись revoke в call_consents),
    // очередь для него не пополняется.
    if (user.callsEnabled !== true) {
      throw new ApiError(409, "CALLS_DISABLED", "Вызовы отключены — включите звонки в личном кабинете");
    }
    const job = await db.callJob.create({ data: { userId, phone: user.phone } });
    res.status(202).json({ ok: true, status: "queued", jobId: job.id });
  }),
);

// GET /queue/poll — клейм старейшего pending-задания.
// Атомарность: updateMany с guard'ом status=pending — при конкуренции двух
// воркеров задание достанется ровно одному, второй получит 204.
router.get(
  "/queue/poll",
  requireWorker,
  asyncHandler(async (req, res) => {
    const worker = typeof req.query.worker === "string" ? req.query.worker.slice(0, 120) : "";
    // Возврат «зависших» ringing в очередь (воркер упал после клейма).
    await db.callJob.updateMany({
      where: { status: "ringing", updatedAt: { lt: new Date(Date.now() - STALE_RINGING_MS) } },
      data: { status: "pending", worker: null },
    });
    const job = await db.callJob.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) {
      res.status(204).end();
      return;
    }
    const claimed = await db.callJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "ringing", worker: worker || null },
    });
    if (claimed.count === 0) {
      res.status(204).end(); // клеймнул другой воркер
      return;
    }
    res.json({ job: { id: job.id, phone: job.phone } });
  }),
);

// POST /queue/:id/result — терминальный результат задания.
// Терминальная запись иммутабельна (урок SAF-198): updateMany с guard'ом
// status=ringing — повторная запись результата не откатывает завершённое.
router.post(
  "/queue/:id/result",
  requireWorker,
  asyncHandler(async (req, res) => {
    const status = (req.body as { status?: unknown })?.status;
    if (status !== "delivered" && status !== "failed") {
      throw new ApiError(400, "BAD_STATUS", "status должен быть delivered или failed");
    }
    const rawError = (req.body as { error?: unknown })?.error;
    const error = typeof rawError === "string" ? rawError.slice(0, 500) : null;
    const updated = await db.callJob.updateMany({
      where: { id: req.params.id, status: "ringing" },
      data: { status, error, completedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Задание не найдено или уже завершено");
    }
    res.json({ ok: true });
  }),
);

export default router;
