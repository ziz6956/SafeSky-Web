import { Router } from "express";
import { db } from "../db";
import { CONSENT_ACTION } from "../lib/consent";
import { ApiError } from "../lib/errors";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

// GET /api/me — текущий пользователь (Bearer).
// SAF-296: в проекцию добавлен consentGranted — действующее согласие на
// автоматические вызовы по журналу call_consents (доказательство по
// ч. 1 ст. 44.1-1 126-ФЗ). Тумблер в ЛК показывает эффективное состояние:
// callsEnabled И последняя запись grant — иначе «включённый» тумблер
// обманывает (аккаунты, созданные до SAF-244: флаг true без записи
// согласия, POST /api/test-call отвечает 409 CALLS_DISABLED).
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
    const lastConsent = await db.callConsent.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json({
      user: {
        ...publicUser(user),
        consentGranted: lastConsent?.action === CONSENT_ACTION.GRANT,
      },
    });
  }),
);

export default router;
