import { describe, expect, it } from "vitest";

import { parseCardScale } from "./card-scale";

describe("card scale preference", () => {
  it("accepts offered sizes and falls back to 100 %", () => {
    expect(parseCardScale("0.85")).toBe(0.85);
    expect(parseCardScale(null)).toBe(1);
    expect(parseCardScale("2")).toBe(1);
    expect(parseCardScale("abc")).toBe(1);
  });
});
