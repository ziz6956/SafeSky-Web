// Правила SMS-авторизации — канон постановки SAF-206 (одобрено основателем 07.10 17:51Z).
export const CODE_LENGTH = 6; // 6 цифр
export const CODE_TTL_SEC = 5 * 60; // TTL 5 минут
export const MAX_ATTEMPTS = 3; // максимум 3 попытки на код
export const RESEND_COOLDOWN_SEC = 30; // повторная отправка не чаще 30 секунд
export const JWT_TTL_SEC = 30 * 24 * 3600; // токен живёт 30 суток (пилот)

// Шаблон SMS — канон SAF-190/SAF-179 (кириллица ≤ 70 символов → 1 сегмент).
export const smsTemplate = (code: string): string =>
  `SafeSky: ваш код — ${code}. Никому не сообщайте.`;

// Домашний аэропорт: whitelist IATA-кодов (расширяемо; ТЗ основателя — DME, далее SVO/VKO/LED).
export const AIRPORTS = ["DME", "SVO", "VKO", "LED", "AER", "KZN", "KUF", "GOJ"] as const;
