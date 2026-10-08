// Dev-режим: SMS никуда не отправляется, код печатается в лог сервера.
// Используется по умолчанию (SMS_PROVIDER=console) — локально и на Render до
// того, как основатель выдаст EXOLVE_API_KEY/EXOLVE_SENDER.
import { maskPhoneForLog } from "../lib/phone";
import { SmsMessage, SmsProvider } from "./provider";

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console" as const;

  async send({ to, text }: SmsMessage): Promise<void> {
    // Номер маскируем (…1234), код остаётся в логе — это назначение console-режима.
    console.log(`[sms:dev] SMS → ${maskPhoneForLog(to)}: ${text}`);
  }
}
