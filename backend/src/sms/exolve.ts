// МТС Exolve — основной SMS-провайдер (канон SAF-190: 3 ₽/SMS, коридор 3–6 ₽).
// Контракт — SAF-179 exolve-assessment §2: POST /messaging/v1/SendSMS, Bearer-ключ,
// номера 11 цифр без «+», ответ { success: true, messageId }.
import { toExolveDigits } from "../lib/phone";
import { SmsMessage, SmsProvider, SmsSendError } from "./provider";

const EXOLVE_SEND_SMS_URL = "https://api.exolve.ru/messaging/v1/SendSMS";

interface ExolveSendSmsResponse {
  success?: boolean;
  messageId?: string;
  error?: unknown;
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
      throw new SmsSendError(`Exolve HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => null)) as ExolveSendSmsResponse | null;
    if (!data || data.success !== true) {
      throw new SmsSendError(`Exolve: ответ без success=true (${JSON.stringify(data ?? {})})`);
    }
    console.log(`[sms:exolve] SMS отправлено на ${to} (messageId=${data.messageId ?? "—"})`);
  }
}
