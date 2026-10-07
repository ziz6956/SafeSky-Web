import jwt from "jsonwebtoken";

// JWT (HS256). sub = id пользователя. Bearer-токен: секреты на фронт не попадают,
// в отличие от куки не нужен CSRF-токен и credentials-хвосты CORS.
export function signToken(userId: string, secret: string, ttlSec: number): string {
  return jwt.sign({}, secret, { subject: userId, expiresIn: ttlSec });
}

export function verifyToken(token: string, secret: string): { userId: string } {
  const payload = jwt.verify(token, secret);
  const sub = typeof payload === "object" && payload !== null && "sub" in payload
    ? String((payload as { sub: unknown }).sub)
    : "";
  if (!sub) throw new Error("token без subject");
  return { userId: sub };
}
