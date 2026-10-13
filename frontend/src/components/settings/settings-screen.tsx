"use client";

import { Code, Download, Info, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { ListRow, ListSection, NavigationPage, RowIcon } from "@/components/ios";

import { LanguageSetting } from "./language-setting";
import { SyncSettings } from "./sync-settings";

/** Link shown under "About" (set at build time, e.g. to your GitHub repository). */
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;

export function SettingsScreen() {
  const t = useTranslations("settings");
  return (
    <NavigationPage title={t("title")}>
      <LanguageSetting />
      <ListSection header={t("collection")}>
        <ListRow
          href="/settings/import"
          icon={<RowIcon icon={Download} color="var(--ios-blue)" />}
          title={t("importTitle")}
        />
        <ListRow
          href="/settings/presets"
          icon={<RowIcon icon={SlidersHorizontal} color="var(--ios-orange)" />}
          title={t("presets")}
        />
      </ListSection>
      <SyncSettings />
      <ListSection header={t("about")}>
        <ListRow
          icon={<RowIcon icon={Info} color="var(--ios-gray)" />}
          title={t("version")}
          detail={process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}
        />
        {SOURCE_URL ? (
          <ListRow
            icon={<RowIcon icon={Code} color="#24292f" />}
            title={
              <a href={SOURCE_URL} target="_blank" rel="noreferrer">
                {t("sourceCode")}
              </a>
            }
            chevron
          />
        ) : null}
      </ListSection>
    </NavigationPage>
  );
}
