import rateLimit from "express-rate-limit";
import { Router } from "express";
import { issueCode, verifyCode } from "../auth/codes";
import { signToken } from "../auth/token";
import { config } from "../config";
import { JWT_TTL_SEC } from "../constants";
import { db } from "../db";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { createSmsProvider } from "../sms";

const sms = createSmsProvider(config);

// Защита бюджета SMS (канон SAF-190: 3 ₽/SMS, пилот ≤750 ₽ защитно):
// не более 20 кодов на IP за 15 минут (~60 ₽ макс. — укладываемся в бюджет).
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Слишком много запросов — попробуйте позже" },
});

// Против подбора кода: не более 60 попыток верификации на IP за 15 минут.
// (Сверх того действуют серверные 3 попытки на код.)
const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Слишком много попыток — попробуйте позже" },
});

const router = Router();

// POST /api/auth/request-code — выпуск 6-значного кода и отправка SMS.
// 202 — код ушёл; 429 — ресенд раньше 30 с (retryAfterSec); 502 — провайдер SMS не сработал.
router.post(
  "/request-code",
  requestCodeLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = (req.body ?? {}) as { phone?: unknown };
    const result = await issueCode(db, sms, config.jwtSecret, String(phone ?? ""));
    res.status(202).json({ ok: true, ...result });
  }),
);

// POST /api/auth/verify-code — проверка кода, создание пользователя, выдача JWT.
router.post(
  "/verify-code",
  verifyCodeLimiter,
  asyncHandler(async (req, res) => {
    const { phone, code } = (req.body ?? {}) as { phone?: unknown; code?: unknown };
    const user = await verifyCode(db, config.jwtSecret, String(phone ?? ""), String(code ?? ""));
    const token = signToken(user.id, config.jwtSecret, JWT_TTL_SEC);
    res.json({ ok: true, token, user: publicUser(user) });
  }),
);

export default router;
