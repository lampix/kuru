"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { ListSection, SegmentedControl } from "@/components/ios";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  type LanguagePreference,
  setLanguagePreference,
  useLanguagePreference,
} from "@/lib/i18n/preference";

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
    <ListSection header={t("language")} footer={t("languageFooter")}>
      <div className="p-3">
        <SegmentedControl
          ariaLabel={t("language")}
          value={preference}
          onChange={change}
          options={[
            { value: "system", label: t("languageSystem") },
            { value: "en", label: t("languageEnglish") },
            { value: "de", label: t("languageGerman") },
          ]}
        />
      </div>
    </ListSection>
  );
}
