-- Flash Call (SAF-223): код = последние 4 цифры номера звонящего.
-- Номер становится известен после отправки (ответ /send) или колбэком —
-- до этого момента codeHash пуст (верификация отвечает 425 CODE_PENDING).
ALTER TABLE "sms_codes" ALTER COLUMN "codeHash" DROP NOT NULL;

-- id звонка у провайдера Flash Call — для сопоставления колбэка.
ALTER TABLE "sms_codes" ADD COLUMN "callId" TEXT;
