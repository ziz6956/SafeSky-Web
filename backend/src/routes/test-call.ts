import rateLimit from "express-rate-limit";
import { Router } from "express";
import { config } from "../config";
import { db } from "../db";
import { ApiError } from "../lib/errors";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { createSmsProvider } from "../sms";

// Тестовый прозвон (SAF-234): демонстрация канала — звонок на номер
// авторизованного пользователя через голосовой Flash Call Plusofon.
// Провайдер дозванивается, голосом проговаривает код, затем сброс.
const sms = createSmsProvider(config);

// Платный канал (пакет голосового Flash Call — 100 звонков), поэтому
// лимит на пользователя: не более 3 тестовых звонков за 10 минут.
const testCallLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (_req, res) => (res.locals as { userId: string }).userId ?? "anon",
  message: { error: "TEST_CALL_TOO_OFTEN", message: "Слишком часто — подождите пару минут и повторите" },
});

// Фиксированный код тестового звонка: всегда «1-2-3-4» — узнаваем при демонстрации
// и отличает тестовый прозвон от авторизационного (там код = последним 4 цифрам номера).
const TEST_CALL_PIN = "1234";

const router = Router();

// POST /api/test-call — инициирует звонок на номер из профиля (Bearer).
// 202 — звонок поставлен провайдеру; 429 — слишком часто; 502 — провайдер не принял.
router.post(
  "/",
  requireAuth,
  testCallLimiter,
  asyncHandler(async (_req, res) => {
    const { userId } = res.locals as { userId: string };
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Пользователь не найден — войдите заново");
    }
    if (!sms.flashCall) {
      throw new ApiError(503, "TEST_CALL_UNAVAILABLE", "Тестовый прозвон доступен только с провайдером Plusofon");
    }
    let callId = "";
    try {
      ({ callId } = await sms.flashCall(user.phone, "", TEST_CALL_PIN));
    } catch (e) {
      console.error(`[test-call] провайдер не принял звонок: ${e instanceof Error ? e.message : String(e)}`);
      throw new ApiError(502, "TEST_CALL_FAILED", "Не удалось инициировать звонок — попробуйте позже");
    }
    res.status(202).json({ ok: true, status: "initiated", callId });
  }),
);

export default router;
