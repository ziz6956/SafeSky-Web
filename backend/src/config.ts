import "dotenv/config";

export interface Config {
  nodeEnv: "production" | "development" | string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  smsProvider: "console" | "exolve" | "plusofon";
  exolveApiKey: string;
  exolveSender: string;
  plusofonApiKey: string;
  plusofonWebhookSecret: string;
  flashCallbackBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? "development";
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`[config] некорректный PORT: ${env.PORT}`);
  }

  const jwtSecret = env.JWT_SECRET ?? "";
  if (nodeEnv === "production" && !jwtSecret) {
    // fail-fast: в проде без секрета подписи токенов сервис не должен подниматься.
    throw new Error("[config] JWT_SECRET обязателен в production (см. .env.example)");
  }

  const corsOrigins = (env.CORS_ORIGINS ?? "https://ziz6956.github.io")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const smsProvider = env.SMS_PROVIDER ?? "console";
  if (smsProvider !== "console" && smsProvider !== "exolve" && smsProvider !== "plusofon") {
    throw new Error(`[config] SMS_PROVIDER должен быть "console", "exolve" или "plusofon", получено: ${smsProvider}`);
  }
  const exolveApiKey = env.EXOLVE_API_KEY ?? "";
  const exolveSender = env.EXOLVE_SENDER ?? "";
  if (smsProvider === "exolve" && (!exolveApiKey || !exolveSender)) {
    throw new Error("[config] SMS_PROVIDER=exolve требует EXOLVE_API_KEY и EXOLVE_SENDER");
  }

  // Plusofon Flash Call (SAF-223): ключ кладёт основатель в Render env, секрет колбэка —
  // генерация FE (не секрет основателя), base-URL колбэка Render подставляет сам
  // (RENDER_EXTERNAL_URL); локально можно переопределить FLASH_CALLBACK_BASE_URL.
  const plusofonApiKey = env.PLUSOFON_API_KEY ?? "";
  const plusofonWebhookSecret = env.PLUSOFON_WEBHOOK_SECRET ?? "";
  if (smsProvider === "plusofon" && !plusofonApiKey) {
    throw new Error("[config] SMS_PROVIDER=plusofon требует PLUSOFON_API_KEY");
  }
  if (smsProvider === "plusofon" && nodeEnv === "production" && !plusofonWebhookSecret) {
    throw new Error("[config] SMS_PROVIDER=plusofon в production требует PLUSOFON_WEBHOOK_SECRET");
  }
  const flashCallbackBaseUrl = (env.FLASH_CALLBACK_BASE_URL ?? env.RENDER_EXTERNAL_URL ?? "").replace(/\/+$/, "");

  return {
    nodeEnv,
    port,
    jwtSecret,
    corsOrigins,
    smsProvider,
    exolveApiKey,
    exolveSender,
    plusofonApiKey,
    plusofonWebhookSecret,
    flashCallbackBaseUrl,
  };
}

export const config: Config = loadConfig();
