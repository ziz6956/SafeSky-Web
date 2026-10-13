// Фабрика провайдера (SAF-300, coverage): выбор реализации по SMS_PROVIDER.
import { describe, expect, it } from "vitest";
import type { Config } from "../config";
import { ConsoleSmsProvider } from "./console";
import { ExolveSmsProvider } from "./exolve";
import { createSmsProvider } from "./index";
import { PlusofonFlashCallProvider } from "./plusofon";

function cfg(patch: Partial<Config> = {}): Config {
  return {
    nodeEnv: "test",
    port: 3000,
    jwtSecret: "s",
    corsOrigins: [],
    smsProvider: "console",
    exolveApiKey: "",
    exolveSender: "",
    plusofonFlashCallToken: "",
    plusofonWebhookSecret: "",
    flashCallbackBaseUrl: "",
    workerToken: "",
    ...patch,
  };
}

describe("createSmsProvider", () => {
  it("console — dev-провайдер (код в лог)", () => {
    expect(createSmsProvider(cfg())).toBeInstanceOf(ConsoleSmsProvider);
  });

  it("exolve — SMS-провайдер МТС Exolve", () => {
    expect(createSmsProvider(cfg({ smsProvider: "exolve" }))).toBeInstanceOf(ExolveSmsProvider);
  });

  it("plusofon — провайдер Flash Call (SAF-223)", () => {
    expect(createSmsProvider(cfg({ smsProvider: "plusofon" }))).toBeInstanceOf(PlusofonFlashCallProvider);
  });
});
