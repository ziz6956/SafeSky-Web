import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { Router } from "express";
import { issueCode, resolveFlashCall, verifyCode } from "../auth/codes";
import { signToken } from "../auth/token";
import { config } from "../config";
import { JWT_TTL_SEC } from "../constants";
import { db } from "../db";
import { ApiError } from "../lib/errors";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { createSmsProvider } from "../sms";
import { CALL_ID_KEYS, CALLER_KEYS, PHONE_KEYS, pick } from "../sms/plusofon";

const sms = createSmsProvider(config);

// Защита бюджета доставки кода (канон SAF-190: 3 ₽/SMS, пилот ≤750 ₽ защитно):
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

// Колбэк Plusofon защищён секретом в query-параметре (зашит в callback_url при отправке).
// Ограничиваем частоту — против перебора секрета вслепую.
const flashCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Слишком много запросов — попробуйте позже" },
});

/** URL колбэка, который уходит провайдеру вместе с запуском Flash Call. */
function flashCallbackUrl(): string {
  if (!config.flashCallbackBaseUrl || !config.plusofonWebhookSecret) return "";
  return `${config.flashCallbackBaseUrl}/api/auth/flash-call/callback?secret=${encodeURIComponent(config.plusofonWebhookSecret)}`;
}

const router = Router();

// POST /api/auth/request-code — запуск подтверждения номера.
// SMS (exolve/console): выпуск 6-значного кода и отправка SMS.
// Flash Call (plusofon): запуск звонка-сброса, код = последние 4 цифры номера звонящего.
// 202 — отправлено/запущено; 429 — ресенд раньше 30 с (retryAfterSec); 502 — провайдер не сработал.
router.post(
  "/request-code",
  requestCodeLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = (req.body ?? {}) as { phone?: unknown };
    const result = await issueCode(db, sms, config.jwtSecret, String(phone ?? ""), flashCallbackUrl());
    res.status(202).json({ ok: true, ...result });
  }),
);

// POST /api/auth/verify-code — проверка кода, создание пользователя, выдача JWT.
// 425 CODE_PENDING — Flash Call ещё не доставлен (попытки не сгорают).
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

// POST /api/auth/flash-call/callback — колбэк Plusofon о состоявшемся Flash Call.
// Формат тела может меняться между версиями API провайдера — поля разбираем
// по известным вариантам имён (sms/plusofon.ts). Без верного секрета — 401.
router.post(
  "/flash-call/callback",
  flashCallbackLimiter,
  asyncHandler(async (req, res) => {
    const secret = String(req.query.secret ?? "");
    const expected = config.plusofonWebhookSecret;
    const secretOk =
      Boolean(expected) && secret.length === expected.length && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
    if (!secretOk) {
      throw new ApiError(401, "UNAUTHORIZED", "Неверный секрет колбэка");
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const callId = pick(body, CALL_ID_KEYS) ?? "";
    const phone = pick(body, PHONE_KEYS) ?? "";
    const caller = pick(body, CALLER_KEYS) ?? "";
    if (!caller) {
      throw new ApiError(400, "BAD_REQUEST", "Колбэк без номера звонящего");
    }

    const matched = await resolveFlashCall(db, config.jwtSecret, { callId, phone }, caller);
    if (!matched) {
      throw new ApiError(404, "CODE_NOT_FOUND", "Не найдена ожидающая верификация");
    }
    res.json({ ok: true });
  }),
);

export default router;
