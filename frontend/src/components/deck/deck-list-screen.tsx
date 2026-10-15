"use client";

import { ChevronRight, Layers, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { NavigationPage, iosButton } from "@/components/ios";
import { SyncIndicator } from "@/components/sync-indicator";
import { useNow } from "@/hooks/use-now";
import { Link } from "@/i18n/navigation";
import { useDeckTree } from "@/lib/db/hooks";
import type { DeckNode } from "@/lib/study/deck-tree";
import { useSyncStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";

function Count({ value, className, label }: { value: number; className: string; label: string }) {
  return (
    <span
      aria-label={`${label}: ${value}`}
      className={cn("min-w-7 text-right tabular-nums", value ? className : "text-label-4")}
    >
      {value}
    </span>
  );
}

function DeckRow({ node, depth }: { node: DeckNode; depth: number }) {
  const t = useTranslations("decks");
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  return (
    <>
      <div className="group/row flex items-stretch">
        <div
          className="flex min-h-12 flex-1 items-center gap-2 pr-3 hairline-b group-last/row:shadow-none"
          style={{ paddingLeft: 8 + depth * 18 }}
        >
          <button
            type="button"
            aria-label={node.shortName}
            aria-expanded={hasChildren ? open : undefined}
            onClick={() => setOpen(!open)}
            className={cn(
              "flex size-7 items-center justify-center text-label-3",
              !hasChildren && "invisible",
            )}
          >
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
              strokeWidth={3}
            />
          </button>
          <Link
            href={{ pathname: "/deck", query: { deck: node.deck.id } }}
            className="flex min-w-0 flex-1 items-center gap-3 py-3 active:opacity-50"
          >
            <span className="min-w-0 flex-1 truncate">{node.shortName}</span>
            <span className="flex gap-2 text-subhead font-medium">
              <Count value={node.counts.new} className="text-ios-blue" label={t("new")} />
              <Count value={node.counts.learning} className="text-ios-red" label={t("learning")} />
              <Count value={node.counts.review} className="text-ios-green" label={t("review")} />
            </span>
          </Link>
          <Link
            href={{ pathname: "/settings/presets", query: { deck: node.deck.id } }}
            aria-label={t("options")}
            className="flex size-8 items-center justify-center text-label-3 active:opacity-50"
          >
            <SlidersHorizontal className="size-[18px]" />
          </Link>
        </div>
      </div>
      {open &&
        node.children.map((child) => (
          <DeckRow key={child.deck.id} node={child} depth={depth + 1} />
        ))}
    </>
  );
}

export function DeckListScreen() {
  const t = useTranslations("decks");
  const now = useNow();
  const tree = useDeckTree(now);
  const { phase } = useSyncStatus();
  const loading = tree === undefined || (tree.length === 0 && phase === "syncing");

  return (
    <NavigationPage title={t("title")} trailing={<SyncIndicator />}>
      {loading ? (
        <p className="py-24 text-center text-label-2" role="status">
          …
        </p>
      ) : tree.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Layers className="size-14 text-label-3" strokeWidth={1.5} aria-hidden />
          <p className="text-title-3 font-semibold">{t("empty")}</p>
          <p className="max-w-xs text-label-2">{t("emptyHint")}</p>
          <Link href="/settings/import" className={iosButton({ variant: "tinted", size: "md" })}>
            {t("importAction")}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] bg-grouped-2">
          {tree.map((node) => (
            <DeckRow key={node.deck.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </NavigationPage>
  );
}
