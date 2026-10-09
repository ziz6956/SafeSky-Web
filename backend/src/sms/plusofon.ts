// Plusofon — провайдер Flash Call (SAF-223): авторизация звонком-сбросом вместо SMS.
// Код = последние 4 цифры номера входящего звонка (канон документации Plusofon:
// help.plusofon.ru/Услуги/Flash_Call, раздел «Управление Flash Call в Plusofon API»).
// Контракт: POST https://restapi.plusofon.ru/api/v1/flash-call/send, Bearer-ключ,
// JSON { phone, callback_url }. Номер звонящего приходит либо в ответе /send,
// либо колбэком — оба пути поддерживаются (см. resolveFlashCall в auth/codes.ts).
import { last4Digits, toExolveDigits } from "../lib/phone";
import { FlashCallResult, SmsProvider, SmsSendError } from "./provider";

const PLUSOFON_SEND_URL = "https://restapi.plusofon.ru/api/v1/flash-call/send";

// Имена полей ответа/колбэка Plusofon могут различаться между версиями API —
// разбираем известные варианты, чтобы смена формата не требовала правки кода.
export const CALL_ID_KEYS = ["id", "call_id", "callId", "request_id"] as const;
export const CALLER_KEYS = ["caller_number", "caller", "ani", "number"] as const;
export const PHONE_KEYS = ["phone", "destination", "to"] as const;

export function pick(obj: unknown, keys: readonly string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

export class PlusofonFlashCallProvider implements SmsProvider {
  readonly name = "plusofon" as const;

  constructor(private readonly apiKey: string) {}

  // SMS-канал у Plusofon не используется: Exolve заменён целиком на Flash Call (SAF-223).
  async send(): Promise<void> {
    throw new SmsSendError("Plusofon: SMS-канал не подключён — доступен только Flash Call");
  }

  async flashCall(to: string, callbackUrl: string): Promise<FlashCallResult> {
    let res: Response;
    try {
      res = await fetch(PLUSOFON_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: toExolveDigits(to),
          // undefined отбрасывается JSON.stringify — колбэк необязателен (код может
          // прийти прямо в ответе /send).
          callback_url: callbackUrl || undefined,
        }),
      });
    } catch (e) {
      throw new SmsSendError(`Plusofon недоступен: ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new SmsSendError(`Plusofon HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (JSON.parse(text || "{}") ?? {}) as Record<string, unknown>;
    const callId = pick(data, CALL_ID_KEYS) ?? "";
    const caller = pick(data, CALLER_KEYS) ?? "";
    const code = last4Digits(caller);
    console.log(`[sms:plusofon] flash call: callId=${callId || "—"}, caller в ответе: ${code ? "да" : "нет"}`);
    return { callId, code };
  }
}
