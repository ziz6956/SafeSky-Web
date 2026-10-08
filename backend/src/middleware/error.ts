import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError } from "../lib/errors";
import { SmsSendError } from "../sms";

// Express 4 не ловит reject'ы async-хендлеров — обёртка пробрасывает их в errorHandler.
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Маршрут не найден" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    return;
  }
  if (err instanceof SmsSendError) {
    // Провайдер SMS упал — код не создан, пользователю можно повторить позже.
    res.status(502).json({ error: "SMS_SEND_FAILED", message: "Не удалось отправить SMS — попробуйте позже" });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    // Сломанный JSON от клиента — 400, а не 500.
    res.status(400).json({ error: "INVALID_JSON", message: "Некорректный JSON в теле запроса" });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "INTERNAL", message: "Внутренняя ошибка сервера" });
};
