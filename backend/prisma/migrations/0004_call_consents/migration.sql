-- SAF-244 (G-CALL-3/G-CALL-4): доказательство согласия на автоматические вызовы.
-- Ч. 1 ст. 44.1-1 126-ФЗ: вызовы считаются совершёнными без согласия, если
-- заказчик не докажет его получение; ч. 3 ст. 9 152-ФЗ — бремя доказывания
-- на операторе. Поэтому каждое действие абонента фиксируем append-only:
-- grant — согласие дано (номер, время, IP, UA, версия показанного текста);
-- revoke — отказ (безусловный, ч. 2 ст. 44.1-1 + ПП РФ № 1994 пп. 222–226).
-- Записи не редактируются и не удаляются. Тумблер users.callsEnabled
-- доказательством не является — он лишь операционное состояние.
CREATE TABLE "call_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "textId" TEXT,
    "textVersion" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_consents_pkey" PRIMARY KEY ("id")
);

-- Хронология действий абонента (аудит следа отказа: кто, когда, каким каналом).
CREATE INDEX "call_consents_userId_createdAt_idx" ON "call_consents"("userId", "createdAt");
