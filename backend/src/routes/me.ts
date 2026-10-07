import { Router } from "express";
import { db } from "../db";
import { ApiError } from "../lib/errors";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

// GET /api/me — текущий пользователь (Bearer).
const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const { userId } = res.locals as { userId: string };
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Пользователь не найден — войдите заново");
    }
    res.json({ user: publicUser(user) });
  }),
);

export default router;
