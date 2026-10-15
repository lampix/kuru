import { describe, expect, it } from "vitest";

import { bucketAxisLabel, bucketRangeLabel, durationParts, parseBucket } from "./duration";

describe("stability bucket labels", () => {
  it("picks the largest exact unit", () => {
    expect(durationParts(3)).toEqual([3, "day"]);
    expect(durationParts(14)).toEqual([2, "week"]);
    expect(durationParts(180)).toEqual([6, "month"]);
    expect(durationParts(730)).toEqual([2, "year"]);
  });

  it("parses API bucket labels", () => {
    expect(parseBucket("7-14")).toEqual({ low: 7, high: 14 });
    expect(parseBucket("730+")).toEqual({ low: 730, high: null });
  });

  it("formats localized axis labels", () => {
    expect(bucketAxisLabel("7-14", "en")).toBe("2w");
    expect(bucketAxisLabel("7-14", "de")).toBe("2 W");
    expect(bucketAxisLabel("730+", "de")).toBe("> 2 J");
  });

  it("formats localized ranges", () => {
    expect(bucketRangeLabel("7-14", "de")).toBe("1–2 Wochen");
    expect(bucketRangeLabel("14-30", "en")).toBe("14–30 days");
    expect(bucketRangeLabel("0-1", "de")).toBe("< 1 Tag");
    expect(bucketRangeLabel("730+", "en")).toBe("≥ 2 years");
  });
});
