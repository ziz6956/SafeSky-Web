// Dev-режим: SMS никуда не отправляется, код печатается в лог сервера.
// Используется по умолчанию (SMS_PROVIDER=console) — локально и на Render до
// того, как основатель выдаст EXOLVE_API_KEY/EXOLVE_SENDER.
import { SmsMessage, SmsProvider } from "./provider";

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console" as const;

  async send({ to, text }: SmsMessage): Promise<void> {
    console.log(`[sms:dev] SMS → ${to}: ${text}`);
  }
}
