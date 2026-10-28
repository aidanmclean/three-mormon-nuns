import { describe, expect, it } from "vitest";
import { isValidCode, normalizeCode, randomCode } from "./code";
import { NAME_MAX_LEN } from "./constants";
import { cleanName, nameKey, validateName } from "./names";

describe("lobby codes", () => {
  it("normalizes: uppercase, letters only, truncated", () => {
    expect(normalizeCode(" ab-c1d e ")).toBe("ABCD");
    expect(normalizeCode("x")).toBe("X");
  });

  it("generates valid codes", () => {
    for (let i = 0; i < 100; i++) expect(isValidCode(randomCode())).toBe(true);
    expect(randomCode(() => 0)).toBe("AAAA");
    expect(randomCode(() => 0.999999)).toBe("ZZZZ");
  });

  it("rejects malformed codes", () => {
    for (const bad of ["", "ABC", "ABCDE", "abcd", "AB1D"])
      expect(isValidCode(bad)).toBe(false);
  });
});

// Built from code points so formatters can't turn them into invisible literals.
const ZWSP = String.fromCodePoint(0x200b); // zero-width space
const RLO = String.fromCodePoint(0x202e); // right-to-left override

describe("names", () => {
  it("collapses whitespace and strips invisible characters", () => {
    expect(cleanName("  Big   Al \n")).toBe("Big Al");
    expect(cleanName(`Al${ZWSP}ex`)).toBe("Alex");
    expect(cleanName(`A${RLO}b`)).toBe("Ab");
  });

  it("keys names case-insensitively after cleaning", () => {
    expect(nameKey("  ALEX ")).toBe(nameKey("alex"));
    expect(nameKey(`Al${ZWSP}ex`)).toBe("alex");
  });

  it("validates length", () => {
    expect(validateName("   ")).toEqual({
      ok: false,
      message: "Enter a name.",
    });
    expect(NAME_MAX_LEN).toBe(16);
    expect(validateName("a".repeat(NAME_MAX_LEN))).toEqual({
      ok: true,
      name: "a".repeat(NAME_MAX_LEN),
    });
    expect(validateName("a".repeat(NAME_MAX_LEN + 1)).ok).toBe(false);
    // Counted in code points, so emoji names aren't penalized.
    expect(validateName("😀".repeat(NAME_MAX_LEN)).ok).toBe(true);
  });
});
