import { Router } from "express";
import { db } from "../db";
import { asyncHandler } from "../middleware/error";

// GET /health — для Render и UptimeRobot (пинг каждые 10 минут).
// Проверяет и процесс, и БД; при недоступной БД — 503, чтобы UptimeRobot это заметил.
const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const uptimeSec = Math.floor(process.uptime());
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok", uptimeSec, db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", uptimeSec, db: "unavailable" });
    }
  }),
);

export default router;
