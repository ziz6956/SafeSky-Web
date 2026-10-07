// Нейтральный интерфейс SMS-провайдера (паттерн SAF-114: реализация изолирована,
// как twilio.ts в основном сервисе). Смена провайдера — только с согласования основателя.
export interface SmsMessage {
  to: string; // E.164: +79XXXXXXXXX
  text: string;
}

export interface SmsProvider {
  readonly name: "exolve" | "console";
  send(msg: SmsMessage): Promise<void>;
}

export class SmsSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsSendError";
  }
}
