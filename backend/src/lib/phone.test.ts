import { describe, expect, it } from "vitest";
import { normalizePhone, toExolveDigits } from "./phone";

describe("normalizePhone", () => {
  it("принимает маску «+7 (999) 124-85-42»", () => {
    expect(normalizePhone("+7 (999) 124-85-42")).toBe("+79991248542");
  });

  it("принимает восьмёрку", () => {
    expect(normalizePhone("8 999 123 45 67")).toBe("+79991234567");
  });

  it("принимает 10 цифр без кода страны", () => {
    expect(normalizePhone("9991234567")).toBe("+79991234567");
  });

  it("принимает уже нормализованный E.164", () => {
    expect(normalizePhone("+79991234567")).toBe("+79991234567");
  });

  it("отвергает мусор", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });

  it("отвергает нероссийские номера (украинский +380)", () => {
    expect(normalizePhone("+380 67 123 45 67")).toBeNull();
  });

  it("отвергает 11 цифр, не начинающиеся с 7/8", () => {
    expect(normalizePhone("99912345678")).toBeNull();
  });
});

describe("toExolveDigits", () => {
  it("снимает «+» — Exolve ждёт 11 цифр", () => {
    expect(toExolveDigits("+79991234567")).toBe("79991234567");
  });
});
