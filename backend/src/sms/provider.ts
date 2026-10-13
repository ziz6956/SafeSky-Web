// Нейтральный интерфейс провайдера авторизации (паттерн SAF-114: реализация изолирована,
// как twilio.ts в основном сервисе). Смена провайдера — только с согласования основателя.
export type ProviderName = "exolve" | "plusofon" | "console";

export interface SmsMessage {
  to: string; // E.164: +79XXXXXXXXX
  text: string;
}

/** Результат запуска Flash Call (SAF-223): звонок-сброс, код = последние 4 цифры номера звонящего. */
export interface FlashCallResult {
  callId: string; // id звонка у провайдера — для сопоставления колбэка
  code: string | null; // код, если номер звонящего известен из ответа; null — придёт колбэком
}

export interface SmsProvider {
  readonly name: ProviderName;
  send(msg: SmsMessage): Promise<void>;
  /** Flash Call (только plusofon); у exolve/console не определён. */
  flashCall?(to: string, callbackUrl: string): Promise<FlashCallResult>;
}

export class SmsSendError extends Error {
  /** HTTP-статус для клиента (по умолчанию 503; 429 — суточный лимит провайдера на номер). */
  readonly status: number;
  /** Машинный код ошибки для клиента. */
  readonly code: string;
  /** Сырой текст провайдера — только в логи, клиенту не отдаётся. */
  readonly details?: string;

  constructor(message: string, opts: { status?: number; code?: string; details?: string } = {}) {
    super(message);
    this.name = "SmsSendError";
    this.status = opts.status ?? 503;
    this.code = opts.code ?? "SMS_SEND_FAILED";
    if (opts.details) this.details = opts.details;
  }
}

// Таймаут вызова внешнего API телефонии (SAF-300): 10 с — намного меньше
// таймаута шлюза Render (~100 с), поэтому при зависшем провайдере клиент
// получает 503 от приложения, а не 502 от шлюза. Провайдер отвечает за секунды.
export const PROVIDER_TIMEOUT_MS = 10_000;
