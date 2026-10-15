"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { ListSection, SelectRow } from "@/components/ios";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  type LanguagePreference,
  setLanguagePreference,
  useLanguagePreference,
} from "@/lib/i18n/preference";

/** Each language is named in itself (as in iOS), so it stays recognisable whatever the UI language. */
const LANGUAGES: { value: AppLocale; label: string }[] = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
];

export function LanguageSetting() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const preference = useLanguagePreference();

  const change = (value: LanguagePreference) => {
    const next = setLanguagePreference(value);
    if (next !== locale) startTransition(() => router.replace(pathname, { locale: next }));
  };

  return (
    <ListSection header={t("general")} footer={t("languageFooter")}>
      <SelectRow
        title={t("language")}
        value={preference}
        onChange={(event) => change(event.target.value as LanguagePreference)}
      >
        <option value="system">{t("languageSystem")}</option>
        {LANGUAGES.map(({ value, label }) => (
          <option key={value} value={value} lang={value}>
            {label}
          </option>
        ))}
      </SelectRow>
    </ListSection>
  );
}
