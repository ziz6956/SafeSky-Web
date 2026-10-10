// Доказательство согласия на автоматические вызовы (SAF-244, G-CALL-3/G-CALL-4).
// Ч. 1 ст. 44.1-1 126-ФЗ: без записи согласия вызовы признаются совершёнными
// без согласия; ч. 3 ст. 9 152-ФЗ — бремя доказывания на операторе.
// Поэтому каждое действие абонента (grant/revoke) фиксируем отдельной
// append-only записью call_consents с контекстом: номер, время, IP, user-agent,
// идентификатор и версия показанного текста, канал действия.
import type { Request } from "express";
import { CALL_CONSENT_TEXT_ID, CALL_CONSENT_TEXT_VERSION } from "../constants";

export const CONSENT_ACTION = { GRANT: "grant", REVOKE: "revoke" } as const;
export const CONSENT_CHANNEL = { WEB_FORM: "web_form", LK: "lk" } as const;

/** IP абонента как есть в req.ip (за прокси Render — X-Forwarded-For, 1 хоп). */
export function clientIp(req: Request): string | null {
  const ip = String(req.ip ?? "");
  return ip ? ip.slice(0, 64) : null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = String(req.headers["user-agent"] ?? "");
  return ua ? ua.slice(0, 300) : null;
}

/** Данные записи «согласие дано»: фиксируем показанный текст (id + версия). */
export function grantConsentData(req: Request, userId: string, phone: string, channel: string) {
  return {
    userId,
    phone,
    action: CONSENT_ACTION.GRANT,
    textId: CALL_CONSENT_TEXT_ID,
    textVersion: CALL_CONSENT_TEXT_VERSION,
    ip: clientIp(req),
    userAgent: clientUserAgent(req),
    channel,
  };
}

/** Данные записи «отказ»: безусловный (ч. 2 ст. 44.1-1 126-ФЗ + ПП РФ № 1994
 *  пп. 222–226) — текста не показываем, поля текста не заполняем. */
export function revokeConsentData(req: Request, userId: string, phone: string, channel: string) {
  return {
    userId,
    phone,
    action: CONSENT_ACTION.REVOKE,
    textId: null,
    textVersion: null,
    ip: clientIp(req),
    userAgent: clientUserAgent(req),
    channel,
  };
}
