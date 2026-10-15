"use client";

import { PartyPopper, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { ListRow, ListSection, NavigationPage, RowIcon, iosButton } from "@/components/ios";
import { useNow } from "@/hooks/use-now";
import { Link } from "@/i18n/navigation";
import { useDeckTree } from "@/lib/db/hooks";
import type { DeckNode } from "@/lib/study/deck-tree";
import { cn } from "@/lib/utils";

function findNode(nodes: readonly DeckNode[], id: number): DeckNode | undefined {
  for (const node of nodes) {
    if (node.deck.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

function CountTile({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 py-3">
      <span
        className={cn("text-title-1 font-bold tabular-nums", value ? className : "text-label-3")}
      >
        {value}
      </span>
      <span className="text-footnote text-label-2">{label}</span>
    </div>
  );
}

/** What a deck has for today, with the entry points to study it. */
export function DeckOverviewScreen() {
  const t = useTranslations("decks");
  const params = useSearchParams();
  const deckId = Number(params.get("deck")) || null;
  const tree = useDeckTree(useNow());
  const node = tree && deckId ? findNode(tree, deckId) : undefined;
  const back = { href: "/", label: t("title") };

  if (!tree) return null;
  if (!node) {
    return (
      <NavigationPage title={t("title")} largeTitle={false} back={back}>
        <p className="py-24 text-center text-label-2">{t("empty")}</p>
      </NavigationPage>
    );
  }

  const { counts } = node;
  const due = counts.new + counts.learning + counts.review;

  return (
    <NavigationPage title={node.shortName} back={back}>
      <div className="flex divide-x divide-separator rounded-[10px] bg-grouped-2">
        <CountTile label={t("new")} value={counts.new} className="text-ios-blue" />
        <CountTile label={t("learning")} value={counts.learning} className="text-ios-red" />
        <CountTile label={t("review")} value={counts.review} className="text-ios-green" />
      </div>

      {due > 0 ? (
        <Link
          href={{ pathname: "/study", query: { deck: node.deck.id } }}
          className={cn(iosButton({ variant: "filled", size: "lg" }), "mt-4 h-[54px]")}
        >
          {t("study")}
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <PartyPopper className="size-12 text-ios-orange" strokeWidth={1.5} aria-hidden />
          <p className="text-title-3 font-semibold">{t("allDone")}</p>
        </div>
      )}

      {node.children.length ? (
        <ListSection header={t("subdecks")}>
          {node.children.map((child) => (
            <ListRow
              key={child.deck.id}
              title={child.shortName}
              detail={t("cards", { count: child.total })}
              href={`/deck?deck=${child.deck.id}`}
            />
          ))}
        </ListSection>
      ) : null}

      <ListSection footer={t("cards", { count: node.total })}>
        <ListRow
          icon={<RowIcon icon={SlidersHorizontal} color="var(--ios-gray)" />}
          title={t("options")}
          href={`/settings/presets?deck=${node.deck.id}`}
        />
      </ListSection>
    </NavigationPage>
  );
}
