// Unit-тесты провайдера Plusofon (SAF-223): формат запроса /send, разбор
// ответа с номером звонящего и без него, ошибки провайдера.
import { afterEach, describe, expect, it, vi } from "vitest";
import { last4Digits } from "../lib/phone";
import { PlusofonFlashCallProvider } from "./plusofon";
import { SmsSendError } from "./provider";

const SEND_URL = "https://restapi.plusofon.ru/api/v1/flash-call/send";

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("last4Digits", () => {
  it("берёт последние 4 цифры из номера любого формата", () => {
    expect(last4Digits("+7 (495) 123-45-67")).toBe("4567");
    expect(last4Digits("79991234567")).toBe("4567");
  });
  it("возвращает null для слишком короткого номера", () => {
    expect(last4Digits("123")).toBeNull();
    expect(last4Digits("")).toBeNull();
  });
});

describe("PlusofonFlashCallProvider", () => {
  it("шлёт POST /flash-call/send с Bearer-ключом и телефоном без «+»", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: "fc-1", caller_number: "74951234567" }));
    vi.stubGlobal("fetch", fetchMock);

    const p = new PlusofonFlashCallProvider("test-key");
    const result = await p.flashCall("+79991234567", "https://safesky-web.onrender.com/api/auth/flash-call/callback?secret=s");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SEND_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toEqual({
      phone: "79991234567",
      callback_url: "https://safesky-web.onrender.com/api/auth/flash-call/callback?secret=s",
    });
    // Код = последние 4 цифры номера звонящего из ответа.
    expect(result).toEqual({ callId: "fc-1", code: "4567" });
  });

  it("code=null, когда в ответе нет номера звонящего (код придёт колбэком)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ id: "fc-2" })));
    const result = await new PlusofonFlashCallProvider("k").flashCall("+79991234567", "");
    expect(result.callId).toBe("fc-2");
    expect(result.code).toBeNull();
  });

  it("непустой callback_url опускается из тела, когда пуст", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: "fc-3", number: "74950001122" }));
    vi.stubGlobal("fetch", fetchMock);
    await new PlusofonFlashCallProvider("k").flashCall("+79991234567", "");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect("callback_url" in body).toBe(false);
  });

  it("HTTP-ошибка провайдера превращается в SmsSendError с кодом статуса", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ error: "Bad API key" }, 403)));
    await expect(new PlusofonFlashCallProvider("bad").flashCall("+79991234567", "")).rejects.toThrow(SmsSendError);
  });
});
