import { createApp } from "./app";
import { config } from "./config";
import { db } from "./db";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(
    `[server] SafeSky backend: http://localhost:${config.port} (env=${config.nodeEnv}, sms=${config.smsProvider})`,
  );
});

// SAF-300: узел сам закрывает зависшие запросы (408) раньше таймаута шлюза
// Render (~100 с) — клиент не получает 502 Bad Gateway от шлюза. Каждый внешний
// вызов дополнительно ограничен PROVIDER_TIMEOUT_MS, это страховка второго уровня.
server.requestTimeout = 45_000;
server.headersTimeout = 60_000;

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
