import { describe, expect, it } from "vitest";
import { attemptsLeft, isExpired, resendWaitSec } from "./policy";

const T0 = new Date("2026-10-07T20:00:00.000Z");

describe("resendWaitSec — повторная отправка не чаще 30 с", () => {
  it("сразу после отправки — полные 30 с", () => {
    expect(resendWaitSec(T0, T0)).toBe(30);
  });

  it("через 10 с — осталось 20", () => {
    expect(resendWaitSec(T0, new Date(T0.getTime() + 10_000))).toBe(20);
  });

  it("через 30 с — можно (0)", () => {
    expect(resendWaitSec(T0, new Date(T0.getTime() + 30_000))).toBe(0);
  });

  it("через 31 с — можно, не уходит в минус", () => {
    expect(resendWaitSec(T0, new Date(T0.getTime() + 31_000))).toBe(0);
  });
});

describe("isExpired — TTL 5 минут", () => {
  it("до истечения — жив", () => {
    expect(isExpired(new Date(T0.getTime() + 299_000), T0)).toBe(false);
  });

  it("ровно на границе — истёк", () => {
    expect(isExpired(T0, T0)).toBe(true);
  });

  it("после — истёк", () => {
    expect(isExpired(new Date(T0.getTime() - 1), T0)).toBe(true);
  });
});

describe("attemptsLeft — максимум 3 попытки", () => {
  it("0 ошибок → 3", () => expect(attemptsLeft(0)).toBe(3));
  it("1 ошибка → 2", () => expect(attemptsLeft(1)).toBe(2));
  it("2 ошибки → 1", () => expect(attemptsLeft(2)).toBe(1));
  it("3 ошибки → 0 (блок)", () => expect(attemptsLeft(3)).toBe(0));
  it("не уходит в минус", () => expect(attemptsLeft(9)).toBe(0));
});
