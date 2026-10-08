import { afterEach, describe, expect, it, vi } from "vitest";
import { ExolveSmsProvider } from "./exolve";
import { SmsSendError } from "./provider";

const DEST = "+79991234567"; // синтетический номер — реальный нигде не используется

function stubFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ExolveSmsProvider", () => {
  it("принимает боевой ответ { message_id } (формат SAF-223)", async () => {
    stubFetch({ message_id: "640811512172186162" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const p = new ExolveSmsProvider("k", "79011292918");

    await expect(p.send({ to: DEST, text: "SafeSky: ваш код — 123456. Никому не сообщайте." })).resolves.toBeUndefined();

    const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("messageId=640811512172186162");
    expect(logged).toContain("…4567"); // маска вместо полного номера
    expect(logged).not.toContain("79991234567");
    expect(logged).not.toContain("91234567");
  });

  it("принимает legacy { success: true, messageId } (оценка SAF-179)", async () => {
    stubFetch({ success: true, messageId: "abc" });
    const p = new ExolveSmsProvider("k", "79011292918");
    await expect(p.send({ to: DEST, text: "t" })).resolves.toBeUndefined();
  });

  it("бросает SmsSendError на ответ с error-блоком, номер в деталях маскируется", async () => {
    stubFetch({ error: { message: "trial mode", details: "destination 79991234567 not whitelisted" } });
    const p = new ExolveSmsProvider("k", "79011292918");

    const err = await p.send({ to: DEST, text: "t" }).catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(String(err.message)).toContain("not whitelisted"); // details приоритетнее message
    expect(String(err.message)).not.toContain("79991234567");
  });

  it("бросает SmsSendError на HTTP 5xx с маскировкой номера из тела", async () => {
    stubFetch("boom: 79991234567", 500);
    const p = new ExolveSmsProvider("k", "79011292918");

    const err = await p.send({ to: DEST, text: "t" }).catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(String(err.message)).toContain("HTTP 500");
    expect(String(err.message)).not.toContain("79991234567");
  });

  it("бросает SmsSendError при недоступности Exolve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const p = new ExolveSmsProvider("k", "79011292918");

    const err = await p.send({ to: DEST, text: "t" }).catch((e) => e);
    expect(err).toBeInstanceOf(SmsSendError);
    expect(String(err.message)).toContain("Exolve недоступен");
  });

  it("отправляет destination 11 цифр без «+» и sender из конструктора", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ message_id: "m1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = new ExolveSmsProvider("k", "79011292918");

    await p.send({ to: DEST, text: "t" });
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body.number).toBe("79011292918");
    expect(body.destination).toBe("79991234567");
  });
});
