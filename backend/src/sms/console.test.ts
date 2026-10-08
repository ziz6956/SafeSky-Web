import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleSmsProvider } from "./console";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleSmsProvider", () => {
  it("печатает код, но маскирует номер (ПДн)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const p = new ConsoleSmsProvider();

    await p.send({ to: "+79991234567", text: "SafeSky: ваш код — 123456. Никому не сообщайте." });

    const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("123456");
    expect(logged).toContain("…4567");
    expect(logged).not.toContain("79991234567");
  });
});
