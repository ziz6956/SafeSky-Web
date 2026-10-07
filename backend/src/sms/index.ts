import type { Config } from "../config";
import { ConsoleSmsProvider } from "./console";
import { ExolveSmsProvider } from "./exolve";
import type { SmsProvider } from "./provider";

export function createSmsProvider(cfg: Config): SmsProvider {
  if (cfg.smsProvider === "exolve") {
    return new ExolveSmsProvider(cfg.exolveApiKey, cfg.exolveSender);
  }
  return new ConsoleSmsProvider();
}

export type { SmsMessage, SmsProvider } from "./provider";
export { SmsSendError } from "./provider";
