// Dev-режим: SMS никуда не отправляется, код печатается в лог сервера.
// Используется по умолчанию (SMS_PROVIDER=console) — локально и на Render до
// того, как основатель выдаст ключ провайдера (EXOLVE_API_KEY/PLUSOFON_API_KEY).
import crypto from "node:crypto";
import { maskPhoneForLog } from "../lib/phone";
import { FlashCallResult, SmsMessage, SmsProvider } from "./provider";

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console" as const;

  async send({ to, text }: SmsMessage): Promise<void> {
    // Номер маскируем (…1234), код остаётся в логе — это назначение console-режима.
    console.log(`[sms:dev] SMS → ${maskPhoneForLog(to)}: ${text}`);
  }

  // Локальная эмуляция Flash Call: звонок не делается, код фиксированный (0000)
  // и печатается в лог сервера — удобно для ручной проверки флоу без провайдера.
  async flashCall(to: string): Promise<FlashCallResult> {
    console.log(`[sms:dev] flash call → ${maskPhoneForLog(to)}: тестовый код 0000`);
    return { callId: `demo-${crypto.randomUUID()}`, code: "0000" };
  }
}
