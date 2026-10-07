import { createApp } from "./app";
import { config } from "./config";
import { db } from "./db";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(
    `[server] SafeSky backend: http://localhost:${config.port} (env=${config.nodeEnv}, sms=${config.smsProvider})`,
  );
});

// Аккуратная остановка (Render шлёт SIGTERM при редеплое).
function shutdown(signal: string) {
  console.log(`[server] ${signal}: останавливаюсь`);
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
  // Если соединения не закрылись за 10 с — выходим принудительно.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
