// Жизненный цикл кода авторизации: выпуск (с доставкой) и верификация.
// Все правила — серверные (в прототипе SAF-179 они были клиентской эмуляцией):
// SMS: 6 цифр; Flash Call (SAF-223): последние 4 цифры номера звонящего.
// Общее: TTL 5 мин, 3 попытки, ресенд ≥30 с, блокировка после 3 неверных.
import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  CODE_LENGTH,
  CODE_TTL_SEC,
  FLASH_CODE_LENGTH,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SEC,
  smsTemplate,
} from "../constants";
import { ApiError } from "../lib/errors";
import { last4Digits, normalizePhone } from "../lib/phone";
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

function invalidPhone(): ApiError {
  return new ApiError(400, "INVALID_PHONE", "Некорректный номер телефона — нужен формат +7 (XXX) XXX-XX-XX");
}

/**
 * Выпуск кода: проверка телефона и ресенд-кулдауна → доставка → запись в БД.
 * SMS-путь (exolve/console): генерируем 6 цифр, отправляем SMS, хеш — в БД.
 * Flash Call (plusofon): запускаем звонок; код известен сразу (если провайдер
 * вернул номер звонящего в ответе) или придёт колбэком — тогда codeHash=null.
 */
export async function issueCode(db: PrismaClient, sms: SmsProvider, secret: string, rawPhone: string, callbackUrl = "") {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw invalidPhone();
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

  const expiresAt = new Date(now.getTime() + CODE_TTL_SEC * 1000);

  if (sms.name === "plusofon") {
    if (!sms.flashCall) {
      throw new ApiError(502, "SMS_SEND_FAILED", "Провайдер не поддерживает Flash Call");
    }
    // Запуск звонка ДО записи в БД: неуспешный запуск не должен «сжигать» кулдаун.
    const { callId, code } = await sms.flashCall(phone, callbackUrl);
    await db.smsCode.create({
      data: {
        phone,
        callId: callId || null,
        codeHash: code ? hashCode(code, secret) : null, // null — код придёт колбэком
        expiresAt,
      },
    });
    return { resendAfterSec: RESEND_COOLDOWN_SEC, pending: code === null };
  }

  const code = generateCode();
  // Отправка ДО записи в БД: неуспешная отправка не должна «сжигать» кулдаун и плодить коды.
  await sms.send({ to: phone, text: smsTemplate(code) });
  await db.smsCode.create({
    data: {
      phone,
      codeHash: hashCode(code, secret),
      expiresAt,
    },
  });
  return { resendAfterSec: RESEND_COOLDOWN_SEC };
}

/**
 * Колбэк Flash Call от провайдера: фиксирует номер звонящего.
 * Код = последние 4 цифры номера; записываем хеш в ожидающую запись.
 * Возвращает false, если ожидающей верификации нет (устарела / уже использована).
 */
export async function resolveFlashCall(
  db: PrismaClient,
  secret: string,
  match: { callId?: string; phone?: string },
  callerNumber: string,
): Promise<boolean> {
  const code = last4Digits(callerNumber);
  if (!code) return false;
  const phone = match.phone ? normalizePhone(match.phone) : null;
  if (!match.callId && !phone) return false;

  const pending = await db.smsCode.findFirst({
    where: { ...(match.callId ? { callId: match.callId } : { phone: phone ?? "" }), usedAt: null, codeHash: null },
    orderBy: { createdAt: "desc" },
  });
  if (!pending || isExpired(pending.expiresAt, new Date())) return false;

  await db.smsCode.update({ where: { id: pending.id }, data: { codeHash: hashCode(code, secret) } });
  return true;
}

/** Верификация кода: при успехе создаёт/находит пользователя и возвращает его. */
export async function verifyCode(db: PrismaClient, secret: string, rawPhone: string, rawCode: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    throw invalidPhone();
  }

  const latest = await db.smsCode.findFirst({ where: { phone, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!latest) {
    throw new ApiError(404, "CODE_NOT_FOUND", "Код не найден — сначала запросите код");
  }

  // Формат кода зависит от канала последней записи: Flash Call — 4 цифры, SMS — 6.
  const isFlash = latest.callId !== null;
  const codeLength = isFlash ? FLASH_CODE_LENGTH : CODE_LENGTH;
  const digitsWord = codeLength === 4 ? "цифры" : "цифр";
  const code = String(rawCode ?? "").trim();
  if (!new RegExp(`^\\d{${codeLength}}$`).test(code)) {
    throw new ApiError(400, "INVALID_CODE_FORMAT", `Введите ${codeLength} ${digitsWord} — ${isFlash ? "последние цифры номера звонка" : "код из SMS"}`);
  }

  const now = new Date();
  if (isExpired(latest.expiresAt, now)) {
    throw new ApiError(410, "CODE_EXPIRED", "Срок действия кода истёк — запросите новый");
  }
  if (latest.attempts >= MAX_ATTEMPTS) {
    throw new ApiError(423, "CODE_BLOCKED", "Код заблокирован — запросите новый", { attemptsLeft: 0 });
  }
  if (latest.codeHash === null) {
    // Звонок ещё не доставлен (колбэк не пришёл) — это не ошибка ввода, попытки не сжигаем.
    throw new ApiError(425, "CODE_PENDING", "Звонок ещё не доставлен — введите код через несколько секунд");
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
