"use client";

import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { NavigationPage, iosButton } from "@/components/ios";
import { Link } from "@/i18n/navigation";

export function DeckListScreen() {
  const t = useTranslations("decks");
  return (
    <NavigationPage title={t("title")}>
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Layers className="size-14 text-label-3" strokeWidth={1.5} aria-hidden />
        <p className="text-title-3 font-semibold">{t("empty")}</p>
        <p className="max-w-xs text-label-2">{t("emptyHint")}</p>
        <Link href="/settings/import" className={iosButton({ variant: "tinted", size: "md" })}>
          {t("importAction")}
        </Link>
      </div>
    </NavigationPage>
  );
}
