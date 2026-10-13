import { describe, expect, it } from "vitest";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { parseAcceptLanguage, resolveLocale } from "./detect";

describe("resolveLocale", () => {
  it("prefers the manual override", () => {
    expect(resolveLocale("de", ["en-US"])).toBe("de");
  });
  it("uses the system language", () => {
    expect(resolveLocale(null, ["de-AT", "en"])).toBe("de");
    expect(resolveLocale(undefined, ["fr-FR", "de"])).toBe("de");
  });
  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale(null, ["fr-FR", "ja"])).toBe("en");
    expect(resolveLocale("xx", [])).toBe("en");
  });
});

describe("parseAcceptLanguage", () => {
  it("orders by quality", () => {
    expect(parseAcceptLanguage("fr;q=0.4, de-DE;q=0.9, en")).toEqual(["en", "de-DE", "fr"]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe("message catalogues", () => {
  const keys = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  it("define the same keys in every locale", () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });
});
