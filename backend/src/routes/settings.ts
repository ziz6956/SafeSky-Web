import { Router } from "express";
import { AIRPORTS } from "../constants";
import { db } from "../db";
import { CONSENT_CHANNEL, grantConsentData, revokeConsentData } from "../lib/consent";
import { ApiError } from "../lib/errors";
import { publicUser } from "../lib/user";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";

// PATCH /api/settings — домашний аэропорт и тумблер звонка (Bearer).
// Номер телефона менять нельзя — readonly по ТЗ основателя.
//
// SAF-244 (G-CALL-3/G-CALL-4): смена тумблера callsEnabled — действие абонента.
// Выключение = отказ: безусловный (ч. 2 ст. 44.1-1 126-ФЗ + ПП РФ № 1994
// пп. 222–226), пишем запись revoke в call_consents и снимаем задания из
// очереди (pending/ringing → cancelled). Включение = новое согласие: пишем
// grant с версией показанного текста. Без перехода записей не плодим.
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

    const user = await db.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (!current) {
        throw new ApiError(401, "UNAUTHORIZED", "Пользователь не найден — войдите заново");
      }
      if (patch.callsEnabled !== undefined && patch.callsEnabled !== current.callsEnabled) {
        if (patch.callsEnabled) {
          // Повторное согласие в ЛК — активное действие (подтверждение в UI).
          await tx.callConsent.create({
            data: grantConsentData(req, current.id, current.phone, CONSENT_CHANNEL.LK),
          });
        } else {
          // Отказ: запись revoke + снятие стоящих в очереди заданий.
          // Воркер снимает только pending, поэтому снятое не обзванивается;
          // вызовы прекращаются не позднее следующего дня (ч. 2 ст. 44.1-1).
          await tx.callConsent.create({
            data: revokeConsentData(req, current.id, current.phone, CONSENT_CHANNEL.LK),
          });
          await tx.callJob.updateMany({
            where: { userId, status: { in: ["pending", "ringing"] } },
            data: { status: "cancelled", completedAt: new Date() },
          });
        }
      }
      return tx.user.update({ where: { id: userId }, data: patch });
    });

    res.json({ user: publicUser(user) });
  }),
);

export default router;
