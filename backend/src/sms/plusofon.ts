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
import { FlashCallResult, PROVIDER_TIMEOUT_MS, SmsProvider, SmsSendError } from "./provider";

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

  constructor(
    private readonly apiKey: string,
    // SAF-300: таймаут вызова /send. Тесты передают маленькое значение, чтобы
    // проверить сценарий зависшего провайдера за миллисекунды, а не за 10 с.
    private readonly timeoutMs: number = PROVIDER_TIMEOUT_MS,
  ) {}

  // SMS-канал у Plusofon не используется: Exolve заменён целиком на Flash Call (SAF-223).
  async send(): Promise<void> {
    throw new SmsSendError("Plusofon: SMS-канал не подключён — доступен только Flash Call");
  }

  async flashCall(to: string, callbackUrl: string): Promise<FlashCallResult> {
    let res: Response;
    try {
      // SAF-300: AbortSignal.timeout обрывает и подключение, и чтение тела —
      // зависший провайдер не подвешивает хендлер до таймаута шлюза Render (502).
      res = await fetch(PLUSOFON_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Client": "10553",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: toExolveDigits(to),
          // undefined отбрасывается JSON.stringify — колбэк необязателен (код может
          // прийти прямо в ответе /send).
          callback_url: callbackUrl || undefined,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
        throw new SmsSendError(`Plusofon: таймаут ${Math.round(this.timeoutMs / 1000)} с — провайдер не ответил`);
      }
      throw new SmsSendError(`Plusofon недоступен: ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const raw = text.slice(0, 200);
      // SAF-300 (продолжение): у Plusofon суточный лимит запросов на один номер —
      // «too many requests for one phone in 24 hours». Это не отказ провайдера,
      // а лимит: клиенту — 429 с понятным текстом (не общий 503), детали — в логи.
      if (res.status === 429) {
        throw new SmsSendError(
          "Слишком много запросов на этот номер — суточный лимит провайдера исчерпан, попробуйте позже",
          { status: 429, code: "SMS_RATE_LIMITED", details: `Plusofon HTTP 429: ${raw}` },
        );
      }
      throw new SmsSendError(`Plusofon HTTP ${res.status}: ${raw}`);
    }
    const data = (JSON.parse(text || "{}") ?? {}) as Record<string, unknown>;
    // v1 прячет полезную нагрузку в data.key / data.pin; старый формат — плоский.
    const nested = ((data.data ?? {}) as Record<string, unknown>);
    const callId = pick(data, CALL_ID_KEYS) ?? pick(nested, CALL_ID_KEYS) ?? "";
    const pin = pick(data, PIN_KEYS) ?? pick(nested, PIN_KEYS) ?? "";
    // Код из pin (авторитетный, если включён return_pin); иначе — последние 4 цифры
    // номера звонящего; если и его нет — null, код придёт колбэком.
    const code = /^\d{4}$/.test(pin) ? pin : last4Digits(pick(data, CALLER_KEYS) ?? pick(nested, CALLER_KEYS) ?? "");
    console.log(`[sms:plusofon] flash call: callId=${callId || "—"}, код в ответе: ${code ? "да" : "нет"}`);
    return { callId, code };
  }
}
