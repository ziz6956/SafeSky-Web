// Plusofon — провайдер Flash Call (SAF-223): авторизация звонком вместо SMS.
// Контракт v1 (help.plusofon.ru, раздел «Flash Call»): POST
// https://restapi.plusofon.ru/api/v1/flash-call/send, заголовок Client: 10553,
// Bearer = access_token Flash Call-аккаунта (НЕ основной ключ ЛК — он даёт 403/401).
// Ответ: { data: { key, pin?, operator? } } — key = ключ проверки (храним как callId),
// pin = 4-значный код. pin приходит только если в настройках аккаунта включён
// return_pin; при same_pin_phone код совпадает с последними 4 цифрами номера
// звонящего. Код может прийти и позже колбэком (hook_url) либо старым форматом
// (номер звонящего в ответе) — все пути поддерживаются (см. resolveFlashCall в
// auth/codes.ts).
import { last4Digits, toExolveDigits } from "../lib/phone";
import { FlashCallResult, SmsProvider, SmsSendError } from "./provider";

const PLUSOFON_SEND_URL = "https://restapi.plusofon.ru/api/v1/flash-call/send";

// Имена полей ответа/колбэка Plusofon могут различаться между версиями API —
// разбираем известные варианты, чтобы смена формата не требовала правки кода.
export const CALL_ID_KEYS = ["key", "id", "call_id", "callId", "request_id"] as const;
export const CALLER_KEYS = ["caller_number", "caller", "ani", "number"] as const;
export const PHONE_KEYS = ["phone", "destination", "to"] as const;
export const PIN_KEYS = ["pin", "code"] as const;

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

  async flashCall(to: string, callbackUrl: string, pin?: string): Promise<FlashCallResult> {
    let res: Response;
    try {
      res = await fetch(PLUSOFON_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Client": "10553",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: toExolveDigits(to),
          // pin — фиксированный код (SAF-234, тестовый прозвон): провайдер подбирает
          // номер, последние цифры которого совпадают с кодом. undefined отбрасывается
          // JSON.stringify — как и колбэк (код может прийти прямо в ответе /send).
          pin: pin || undefined,
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
    // v1 прячет полезную нагрузку в data.key / data.pin; старый формат — плоский.
    const nested = ((data.data ?? {}) as Record<string, unknown>);
    const callId = pick(data, CALL_ID_KEYS) ?? pick(nested, CALL_ID_KEYS) ?? "";
    const pinFromResponse = pick(data, PIN_KEYS) ?? pick(nested, PIN_KEYS) ?? "";
    // Код из pin (авторитетный, если включён return_pin); иначе — последние 4 цифры
    // номера звонящего; если и его нет — null, код придёт колбэком.
    const code = /^\d{4}$/.test(pinFromResponse) ? pinFromResponse : last4Digits(pick(data, CALLER_KEYS) ?? pick(nested, CALLER_KEYS) ?? "");
    console.log(`[sms:plusofon] flash call: callId=${callId || "—"}, код в ответе: ${code ? "да" : "нет"}`);
    return { callId, code };
  }
}
