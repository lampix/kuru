import { describe, expect, it } from "vitest";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import it_ from "../../messages/it.json";
import { resolveLocale } from "./detect";

describe("resolveLocale", () => {
  it("prefers the manual override", () => {
    expect(resolveLocale("de", ["en-US"])).toBe("de");
  });
  it("uses the system language", () => {
    expect(resolveLocale(null, ["de-AT", "en"])).toBe("de");
    expect(resolveLocale(undefined, ["pt-BR", "de"])).toBe("de");
    expect(resolveLocale(null, ["fr-CA"])).toBe("fr");
    expect(resolveLocale(null, ["es-419"])).toBe("es");
    expect(resolveLocale(null, ["it-IT"])).toBe("it");
  });
  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale(null, ["pt-PT", "ja"])).toBe("en");
    expect(resolveLocale("xx", [])).toBe("en");
  });
});

describe("message catalogues", () => {
  const keys = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  it("define the same keys in every locale", () => {
    for (const catalogue of [de, fr, es, it_]) {
      expect(keys(catalogue).sort()).toEqual(keys(en).sort());
    }
  });
});
