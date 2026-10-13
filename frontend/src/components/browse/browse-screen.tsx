"use client";

import { useTranslations } from "next-intl";

import { NavigationPage } from "@/components/ios";

export function BrowseScreen() {
  const t = useTranslations("browse");
  return (
    <NavigationPage title={t("title")}>
      <p className="py-24 text-center text-label-2">{t("noResults")}</p>
    </NavigationPage>
  );
}
