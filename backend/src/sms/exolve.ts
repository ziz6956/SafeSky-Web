// МТС Exolve — основной SMS-провайдер (канон SAF-190: 3 ₽/SMS, коридор 3–6 ₽).
// Контракт: POST /messaging/v1/SendSMS, Bearer-ключ, номера 11 цифр без «+» (SAF-179 §2).
// Успех — { message_id } (проверено боевой отправкой SAF-223, 08.10); ошибка —
// { error: { message, details } }. Legacy { success: true, messageId } из оценки
// тоже принимаем — документация Exolve по формату ответа противоречива.
import { maskPhoneForLog, toExolveDigits } from "../lib/phone";
import { SmsMessage, SmsProvider, SmsSendError } from "./provider";

const EXOLVE_SEND_SMS_URL = "https://api.exolve.ru/messaging/v1/SendSMS";

interface ExolveSendSmsResponse {
  success?: boolean;
  messageId?: string;
  message_id?: string;
  error?: { message?: string; details?: string };
}

/** В текст ошибки полный номер получателя не попадает — режем длинные цифровые последовательности. */
function sanitizeError(text: string): string {
  return text.replace(/\d{11,}/g, (m) => `…${m.slice(-4)}`);
}

export class ExolveSmsProvider implements SmsProvider {
  readonly name = "exolve" as const;

  constructor(private readonly apiKey: string, private readonly sender: string) {}

  async send({ to, text }: SmsMessage): Promise<void> {
    let res: Response;
    try {
      res = await fetch(EXOLVE_SEND_SMS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: this.sender, destination: toExolveDigits(to), text }),
      });
    } catch (e) {
      throw new SmsSendError(`Exolve недоступен: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      throw new SmsSendError(`Exolve HTTP ${res.status}: ${sanitizeError((await res.text().catch(() => "")).slice(0, 200))}`);
    }
    const data = (await res.json().catch(() => null)) as ExolveSendSmsResponse | null;
    if (!data || (data.success !== true && !data.message_id)) {
      const detail = sanitizeError(data?.error?.details ?? data?.error?.message ?? JSON.stringify(data ?? {}));
      throw new SmsSendError(`Exolve: отправка не удалась (${detail.slice(0, 200)})`);
    }
    const messageId = data.message_id ?? data.messageId ?? "—";
    console.log(`[sms:exolve] SMS отправлено на ${maskPhoneForLog(to)} (messageId=${messageId})`);
  }
}
