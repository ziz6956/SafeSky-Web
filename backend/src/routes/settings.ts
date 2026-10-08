import { Router } from "express";
import { AIRPORTS } from "../constants";
import { db } from "../db";
import { ApiError } from "../lib/errors";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

// PATCH /api/settings — домашний аэропорт и тумблер звонка (Bearer).
// Номер телефона менять нельзя — readonly по ТЗ основателя.
const router = Router();

router.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = res.locals as { userId: string };
    const body = (req.body ?? {}) as { airport?: unknown; callsEnabled?: unknown };

    const patch: { airport?: string; callsEnabled?: boolean } = {};
    if (body.airport !== undefined) {
      const airport = String(body.airport).toUpperCase().trim();
      if (!(AIRPORTS as readonly string[]).includes(airport)) {
        throw new ApiError(400, "INVALID_AIRPORT", `Аэропорт не поддерживается. Доступны: ${AIRPORTS.join(", ")}`);
      }
      patch.airport = airport;
    }
    if (body.callsEnabled !== undefined) {
      if (typeof body.callsEnabled !== "boolean") {
        throw new ApiError(400, "INVALID_BODY", "callsEnabled должен быть boolean");
      }
      patch.callsEnabled = body.callsEnabled;
    }
    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "INVALID_BODY", "Нет полей для обновления — допустимы airport и callsEnabled");
    }

    const user = await db.user.update({ where: { id: userId }, data: patch });
    res.json({ user: publicUser(user) });
  }),
);

export default router;
