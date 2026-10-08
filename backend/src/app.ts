import cors from "cors";
import express from "express";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./middleware/error";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import meRouter from "./routes/me";
import settingsRouter from "./routes/settings";

// CORS (постановка SAF-206): точный origin https://ziz6956.github.io + http://localhost:*
// для локальной разработки. Авторизация — Bearer-токен, поэтому точный origin достаточен;
// credentials:true оставлен на случай перехода на куки (с куками без «*» — требование ТЗ).
const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / серверные запросы
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

export function createApp(): express.Express {
  const app = express();
  // За прокси Render: доверять X-Forwarded-For первого хопа, чтобы rate-limit видел
  // реальный IP клиента. На голом VPS без прокси — убрать (иначе IP можно подделать).
  app.set("trust proxy", 1);

  app.use(corsMiddleware);
  app.use(express.json({ limit: "10kb" }));

  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/settings", settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
