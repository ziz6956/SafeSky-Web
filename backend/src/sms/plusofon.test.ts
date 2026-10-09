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
  it("шлёт POST /flash-call/send с Bearer-ключом, Client-заголовком и телефоном без «+»", async () => {
    // Контракт v1: { success, data: { key, pin } }.
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ success: true, data: { key: "fc-1", pin: "2372" } }));
    vi.stubGlobal("fetch", fetchMock);

    const p = new PlusofonFlashCallProvider("test-key");
    const result = await p.flashCall("+79991234567", "https://safesky-web.onrender.com/api/auth/flash-call/callback?secret=s");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SEND_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Client"]).toBe("10553");
    expect(JSON.parse(String(init.body))).toEqual({
      phone: "79991234567",
      callback_url: "https://safesky-web.onrender.com/api/auth/flash-call/callback?secret=s",
    });
    // Код = pin из ответа (return_pin), key — идентификатор вызова.
    expect(result).toEqual({ callId: "fc-1", code: "2372" });
  });

  it("pin имеет приоритет над номером звонящего, если пришли оба", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({
      data: { key: "fc-p", pin: "1234", caller_number: "74951234567" },
    })));
    const result = await new PlusofonFlashCallProvider("k").flashCall("+79991234567", "");
    expect(result).toEqual({ callId: "fc-p", code: "1234" });
  });

  it("старый формат: код = последние 4 цифры номера звонящего, когда pin нет", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ id: "fc-legacy", caller_number: "74951234567" })));
    const result = await new PlusofonFlashCallProvider("k").flashCall("+79991234567", "");
    expect(result).toEqual({ callId: "fc-legacy", code: "4567" });
  });

  it("code=null, когда в ответе нет ни pin, ни номера звонящего (код придёт колбэком)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ data: { key: "fc-2" } })));
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
