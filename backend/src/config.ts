import "dotenv/config";

export interface Config {
  nodeEnv: "production" | "development" | string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  smsProvider: "console" | "exolve" | "plusofon";
  exolveApiKey: string;
  exolveSender: string;
  plusofonFlashCallToken: string;
  plusofonWebhookSecret: string;
  flashCallbackBaseUrl: string;
  workerToken: string;
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

  // Plusofon Flash Call (SAF-223): два разных токена.
  // PLUSOFON_API_KEY (основной ключ ЛК) — только для управления аккаунтами/пакетами
  // по API, приложением не читается. PLUSOFON_FLASH_CALL_TOKEN — access_token
  // Flash Call-аккаунта (выдаётся при создании аккаунта), им подписывается
  // /flash-call/send. Секрет колбэка — генерация FE (не секрет основателя),
  // base-URL колбэка Render подставляет сам (RENDER_EXTERNAL_URL); локально
  // можно переопределить FLASH_CALLBACK_BASE_URL.
  const plusofonFlashCallToken = env.PLUSOFON_FLASH_CALL_TOKEN ?? "";
  const plusofonWebhookSecret = env.PLUSOFON_WEBHOOK_SECRET ?? "";
  if (smsProvider === "plusofon" && !plusofonFlashCallToken) {
    throw new Error("[config] SMS_PROVIDER=plusofon требует PLUSOFON_FLASH_CALL_TOKEN (access_token Flash Call-аккаунта)");
  }
  if (smsProvider === "plusofon" && nodeEnv === "production" && !plusofonWebhookSecret) {
    throw new Error("[config] SMS_PROVIDER=plusofon в production требует PLUSOFON_WEBHOOK_SECRET");
  }
  const flashCallbackBaseUrl = (env.FLASH_CALLBACK_BASE_URL ?? env.RENDER_EXTERNAL_URL ?? "").replace(/\/+$/, "");

  // Токен SIP-воркера (SAF-234/235): воркер поллит очередь через HTTP.
  // Отдельный от JWT пользователей секрет; пустой — воркер не настроен
  // (POST /api/test-call отвечает 503, чтобы звонок не завис в очереди навсегда).
  const workerToken = env.WORKER_TOKEN ?? "";

  return {
    nodeEnv,
    port,
    jwtSecret,
    corsOrigins,
    smsProvider,
    exolveApiKey,
    exolveSender,
    plusofonFlashCallToken,
    plusofonWebhookSecret,
    flashCallbackBaseUrl,
    workerToken,
  };
}

export const config: Config = loadConfig();
