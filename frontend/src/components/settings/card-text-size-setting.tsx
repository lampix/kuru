"use client";

import { useFormatter, useTranslations } from "next-intl";

import { ListSection, SegmentedControl } from "@/components/ios";
import { CardView } from "@/components/review/card-view";
import { CARD_SCALES, setCardScale, useCardScale } from "@/lib/preferences/card-scale";

/** Card text size: a factor on top of the deck's CSS (and the automatic phone scaling). */
export function CardTextSizeSetting() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const scale = useCardScale();
  const sample = `<div style="font-size: 40px">漢字</div><hr>${t("cardTextSizeSample")}`;

  return (
    <ListSection header={t("display")} footer={t("cardTextSizeFooter")}>
      <div className="flex flex-col gap-3 px-4 py-3">
        <span>{t("cardTextSize")}</span>
        <SegmentedControl
          ariaLabel={t("cardTextSize")}
          value={String(scale)}
          onChange={(value) => setCardScale(Number(value))}
          options={CARD_SCALES.map((value) => ({
            value: String(value),
            label: format.number(value, { style: "percent" }),
          }))}
        />
        <CardView html={sample} css="" className="rounded-[10px] bg-grouped" />
      </div>
    </ListSection>
  );
}
