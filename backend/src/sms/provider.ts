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
  /** Flash Call (только plusofon); у exolve/console не определён.
   *  pin — фиксированный код (SAF-234, тестовый прозвон); без него код подбирает провайдер. */
  flashCall?(to: string, callbackUrl: string, pin?: string): Promise<FlashCallResult>;
}

export class SmsSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsSendError";
  }
}
