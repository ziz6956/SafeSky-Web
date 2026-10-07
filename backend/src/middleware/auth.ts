import type { RequestHandler } from "express";
import { verifyToken } from "../auth/token";
import { config } from "../config";
import { ApiError } from "../lib/errors";

// Bearer-токен (JWT HS256). sub → res.locals.userId.
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "UNAUTHORIZED", "Требуется авторизация"));
  }
  try {
    const { userId } = verifyToken(token, config.jwtSecret);
    (res.locals as { userId: string }).userId = userId;
    next();
  } catch {
    next(new ApiError(401, "UNAUTHORIZED", "Токен недействителен или истёк — войдите заново"));
  }
};
