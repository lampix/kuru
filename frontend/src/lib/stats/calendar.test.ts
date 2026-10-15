import { describe, expect, it } from "vitest";

import { daysBetween, heatColor, monthRange, weekColumns, weekday, yearRange } from "./calendar";

describe("calendar helpers", () => {
  it("computes month and year ranges", () => {
    expect(monthRange(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange(2026, 12)).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(yearRange(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(daysBetween("2024-12-30", "2025-01-02")).toHaveLength(4);
  });

  it("numbers weekdays from Monday", () => {
    expect(weekday("2026-10-12")).toBe(1);
    expect(weekday("2026-10-18")).toBe(7);
  });

  it("lays a year out in week columns", () => {
    // 2026-01-01 is a Thursday.
    const monday = weekColumns("2026-01-01", "2026-12-31", 1);
    expect(monday[0]).toEqual([
      null,
      null,
      null,
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
    expect(monday.flat().filter(Boolean)).toHaveLength(365);
    expect(monday.every((c) => c.length === 7)).toBe(true);
    const sunday = weekColumns("2026-01-01", "2026-12-31", 7);
    expect(sunday[0]!.indexOf("2026-01-01")).toBe(4);
  });

  it("maps intensity to the empty colour, the tint and beyond", () => {
    expect(heatColor(0)).toBe("var(--heat-empty)");
    expect(heatColor(0.5)).toContain("100%");
    expect(heatColor(1)).toContain("50%, var(--heat-peak)");
  });
});
