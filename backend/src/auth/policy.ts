// Чистая логика лимитов кода — вынесена из БД-слоя ради unit-тестов.
import { MAX_ATTEMPTS, RESEND_COOLDOWN_SEC } from "../constants";

/** Сколько секунд ещё ждать до разрешённой повторной отправки (0 — можно). */
export function resendWaitSec(lastSentAt: Date, now: Date): number {
  const elapsedSec = Math.floor((now.getTime() - lastSentAt.getTime()) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SEC - elapsedSec);
}

/** Код истёк (строгое сравнение: expiresAt <= now). */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Сколько попыток осталось после `attempts` неверных вводов. */
export function attemptsLeft(attempts: number): number {
  return Math.max(0, MAX_ATTEMPTS - attempts);
}
