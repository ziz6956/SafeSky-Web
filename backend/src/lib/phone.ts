// Нормализация РФ-номера к E.164 («+79XXXXXXXXX»).
// Принимает: «+7 (999) 124-85-42», «8 999 123 45 67», «9991234567» (без кода страны).
// Возвращает null, если номер не похож на российский мобильный.
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  let d = digits;
  if (d.length === 10 && d.startsWith("9")) d = "7" + d; // потерянная семёрка
  if (d.startsWith("8")) d = "7" + d.slice(1); // восьмёрка → семёрка
  if (!/^7\d{10}$/.test(d)) return null;
  return "+" + d;
}

// Exolve SendSMS принимает номер 11 цифр без «+» (канон SAF-179 exolve-assessment §2).
export function toExolveDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}

// Маскирует телефон для логов: «…4567» (полный номер в логи не пишем — ПДн, SAF-223).
export function maskPhoneForLog(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : phone;
}

// Flash Call (SAF-223): код = последние 4 цифры номера звонящего.
// null — номер короче 4 цифр (такого не бывает у реальных номеров).
export function last4Digits(number: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
