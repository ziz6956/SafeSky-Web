-- SAF-234/235: очередь тестовых прозвонков для SIP-воркера (pjsua2).
-- Воркер живёт вне Render (Hetzner/РФ-VPS) и ходит только через HTTP-эндпоинты
-- /api/test-call/queue/* — прямого подключения к Render Postgres извне нет
-- (free-тариф). Терминальные статусы (delivered/failed) иммутабельны: повторная
-- запись результата не откатывает завершённое задание (урок SAF-198).
CREATE TABLE "call_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "worker" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_jobs_pkey" PRIMARY KEY ("id")
);

-- Поллинг воркера: старейшее pending + откат «зависших» ringing (воркер упал
-- между клеймом и результатом — вернём задание в очередь по updatedAt).
CREATE INDEX "call_jobs_status_createdAt_idx" ON "call_jobs"("status", "createdAt");
