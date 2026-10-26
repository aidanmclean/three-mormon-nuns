import { describe, expect, it } from "vitest";
import { normalizeCode } from "./index";

describe("normalizeCode", () => {
  it("uppercases, strips non-letters and truncates", () => {
    expect(normalizeCode(" ab-c1d e ")).toBe("ABCD");
  });

  it("leaves short codes short", () => {
    expect(normalizeCode("x")).toBe("X");
  });
});
