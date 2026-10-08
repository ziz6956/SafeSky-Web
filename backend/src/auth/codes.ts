// Жизненный цикл SMS-кода: выпуск (с отправкой) и верификация.
// Все правила — серверные (в прототипе SAF-179 они были клиентской эмуляцией):
// 6 цифр, TTL 5 мин, 3 попытки, ресенд ≥30 с, блокировка после 3 неверных.
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CODE_LENGTH, CODE_TTL_SEC, MAX_ATTEMPTS, RESEND_COOLDOWN_SEC, smsTemplate } from "../constants";
import { ApiError } from "../lib/errors";
import { normalizePhone } from "../lib/phone";
import type { SmsProvider } from "../sms/provider";
import { attemptsLeft, isExpired, resendWaitSec } from "./policy";

// HMAC-SHA256 кода: в БД код не хранится открытым текстом.
// Против подбора 10^6 вариантов по хешу защищают лимиты попыток (3) и TTL (5 мин) + rate-limit по IP.
function hashCode(code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

function codeMatches(submitted: string, codeHash: string, secret: string): boolean {
  const a = Buffer.from(hashCode(submitted, secret), "hex");
  const b = Buffer.from(codeHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generateCode(): string {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Выпуск кода: проверка телефона и ресенд-кулдауна → отправка SMS → запись в БД. */
export async function issueCode(db: PrismaClient, sms: SmsProvider, secret: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new ApiError(400, "INVALID_PHONE", "Некорректный номер телефона — нужен формат +7 (XXX) XXX-XX-XX");
  }

  const latest = await db.smsCode.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  const now = new Date();
  if (latest) {
    const waitSec = resendWaitSec(latest.createdAt, now);
    if (waitSec > 0) {
      throw new ApiError(429, "RESEND_TOO_SOON", "Повторная отправка доступна не чаще, чем раз в 30 секунд", {
        retryAfterSec: waitSec,
      });
    }
  }

  const code = generateCode();
  // Отправка ДО записи в БД: неуспешная отправка не должна «сжигать» кулдаун и плодить коды.
  await sms.send({ to: phone, text: smsTemplate(code) });
  await db.smsCode.create({
    data: {
      phone,
      codeHash: hashCode(code, secret),
      expiresAt: new Date(now.getTime() + CODE_TTL_SEC * 1000),
    },
  });
  return { resendAfterSec: RESEND_COOLDOWN_SEC };
}

/** Верификация кода: при успехе создаёт/находит пользователя и возвращает его. */
export async function verifyCode(db: PrismaClient, secret: string, rawPhone: string, rawCode: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw new ApiError(400, "INVALID_PHONE", "Некорректный номер телефона — нужен формат +7 (XXX) XXX-XX-XX");
  }
  const code = String(rawCode ?? "").trim();
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
    throw new ApiError(400, "INVALID_CODE_FORMAT", `Код — ${CODE_LENGTH} цифр`);
  }

  const latest = await db.smsCode.findFirst({ where: { phone, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!latest) {
    throw new ApiError(404, "CODE_NOT_FOUND", "Код не найден — сначала запросите код");
  }

  const now = new Date();
  if (isExpired(latest.expiresAt, now)) {
    throw new ApiError(410, "CODE_EXPIRED", "Срок действия кода истёк — запросите новый");
  }
  if (latest.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(423, "CODE_BLOCKED", "Код заблокирован — запросите новый", { attemptsLeft: 0 });
  }

  if (!codeMatches(code, latest.codeHash, secret)) {
    const updated = await db.smsCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    if (updated.attempts >= MAX_ATTEMPTS) {
      throw new ApiError(423, "CODE_BLOCKED", "Превышено число попыток — запросите новый код", { attemptsLeft: 0 });
    }
    throw new ApiError(401, "CODE_INVALID", "Неверный код", { attemptsLeft: attemptsLeft(updated.attempts) });
  }

  await db.smsCode.update({ where: { id: latest.id }, data: { usedAt: now } });
  // Пользователь создаётся только в момент успешной верификации —
  // брошенные регистрации не оставляют мусорных записей в users.
  const user = await db.user.upsert({ where: { phone }, update: {}, create: { phone } });
  return user;
}
