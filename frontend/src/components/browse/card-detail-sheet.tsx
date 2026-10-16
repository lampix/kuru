"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog, ListRow, ListSection, SegmentedControl } from "@/components/ios";
import { CardView } from "@/components/review/card-view";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api/client";
import type { HistoryEntry } from "@/lib/api/types";
import { AudioPlayer } from "@/lib/audio";
import { templateName } from "@/lib/browse/filter";
import { db } from "@/lib/db";
import { CardState, Scheduler } from "@/lib/fsrs";
import { noteFields, renderCard, renderField } from "@/lib/render";
import { presetForDeck } from "@/lib/study/deck-tree";
import { applyMemory } from "@/lib/sync/outbox";

const RATING_LABEL = ["", "again", "hard", "good", "easy"] as const;
const RATING_COLOR = [
  "text-label-2",
  "text-ios-red",
  "text-ios-orange",
  "text-ios-blue",
  "text-ios-green",
];

/** Card info: preview of both sides, note fields, statistics, actions and review history. */
export function CardDetailSheet({
  cardId,
  onClose,
}: {
  cardId: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("browse");
  const review = useTranslations("review");
  const common = useTranslations("common");
  const format = useFormatter();
  const [history, setHistory] = useState<{ cardId: number; entries: HistoryEntry[] | null } | null>(
    null,
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [side, setSide] = useState<"question" | "answer">("answer");
  const audio = useMemo(() => new AudioPlayer(), []);

  // Stop playback when another card is shown, the sheet closes or the screen unmounts.
  useEffect(() => () => audio.stop(), [audio, cardId]);
  const [error, setError] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (cardId === null) return null;
    const card = await db.cards.get(cardId);
    if (!card) return null;
    const [noteType, deck, presets] = await Promise.all([
      db.noteTypes.get(card.note_type_id),
      db.decks.get(card.deck_id),
      db.presets.toArray(),
    ]);
    return { card, noteType, deck, preset: deck ? presetForDeck(deck, presets) : undefined };
  }, [cardId]);

  useEffect(() => {
    if (cardId === null) return;
    let cancelled = false;
    api.cardHistory(cardId).then(
      (entries) => !cancelled && setHistory({ cardId, entries }),
      () => !cancelled && setHistory({ cardId, entries: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [cardId, data?.card.reps]);

  const rendered = useMemo(
    () =>
      data?.noteType ? renderCard(data.noteType, data.card, { deckName: data.deck?.name }) : null,
    [data],
  );
  const fields = useMemo(
    () =>
      data?.noteType
        ? noteFields(data.noteType, data.card).map((field) => ({
            ...field,
            html: field.value.trim() ? renderField(field.value, review("replayAudio")) : null,
          }))
        : [],
    [data, review],
  );
  const retrievability = useMemo(
    () => (data?.preset ? new Scheduler(data.preset).retrievability(data.card) : null),
    [data],
  );

  const act = async (action: "suspend" | "unsuspend" | "forget") => {
    if (!data) return;
    setError(null);
    try {
      const [memory] = await api.cardActions([data.card.id], action);
      if (memory) await db.cards.put(applyMemory(data.card, memory));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const card = data?.card;
  const entries = history?.cardId === cardId ? history.entries : undefined;
  const percent = (v: number | null) =>
    v === null ? "–" : format.number(v, { style: "percent", maximumFractionDigits: 0 });
  const number = (v: number | null) =>
    v === null ? "–" : format.number(v, { maximumFractionDigits: 2 });

  return (
    <Sheet open={cardId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="overflow-y-auto rounded-t-[14px] border-0 bg-grouped px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] data-[side=bottom]:h-[94dvh]"
      >
        <SheetTitle className="pt-4 text-center text-headline">{t("cardInfo")}</SheetTitle>
        {card && rendered ? (
          <>
            <SegmentedControl
              ariaLabel={t("cardSide")}
              value={side}
              onChange={setSide}
              options={[
                { value: "question", label: t("front") },
                { value: "answer", label: t("back") },
              ]}
              className="mx-auto mt-3 w-full max-w-xs"
            />
            <div className="mt-3 shrink-0 overflow-hidden rounded-[14px] bg-grouped-2">
              <CardView
                html={side === "question" ? rendered.question : rendered.answer}
                css={rendered.css}
                onPlaySound={(name) => void audio.play(name)}
              />
            </div>

            <ListSection header={t("fields")}>
              {fields.map((field) => (
                <div key={field.name} className="group/row">
                  <div className="px-4 py-2.5 hairline-b group-last/row:shadow-none">
                    <div className="text-footnote text-label-2">{field.name}</div>
                    {field.html === null ? (
                      <div className="text-label-3">–</div>
                    ) : (
                      <CardView
                        html={field.html}
                        css=""
                        variant="field"
                        onPlaySound={(name) => void audio.play(name)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </ListSection>

            <ListSection header={t("cardSection")}>
              <ListRow title={t("deck")} detail={data?.deck?.name.replaceAll("::", " › ")} />
              <ListRow title={t("noteType")} detail={data?.noteType?.name} />
              <ListRow title={t("cardType")} detail={templateName(card, data?.noteType) || "–"} />
              <ListRow title={t("tags")} detail={card.tags.join(" ") || "–"} />
              <ListRow
                title={t("due")}
                detail={
                  card.state === CardState.New || !card.due
                    ? t("stateNew")
                    : format.dateTime(new Date(card.due), { dateStyle: "medium" })
                }
              />
            </ListSection>

            <ListSection header={t("statistics")}>
              <ListRow
                title={t("stability")}
                detail={card.stability === null ? "–" : `${number(card.stability)} d`}
              />
              <ListRow title={t("difficulty")} detail={number(card.difficulty)} />
              <ListRow title={t("retrievability")} detail={percent(retrievability)} />
              <ListRow title={t("reviews")} detail={format.number(card.reps)} />
              <ListRow title={t("lapses")} detail={format.number(card.lapses)} />
            </ListSection>

            <ListSection>
              <ListRow
                title={card.suspended ? t("unsuspend") : t("suspend")}
                tinted
                onClick={() => void act(card.suspended ? "unsuspend" : "suspend")}
              />
              <ListRow title={t("forget")} destructive onClick={() => setConfirmReset(true)} />
            </ListSection>
            {error ? <p className="mt-2 px-4 text-footnote text-ios-red">{error}</p> : null}

            <ListSection header={t("history")}>
              {entries === undefined ? (
                <ListRow title={common("loading")} />
              ) : entries === null ? (
                <ListRow title={common("offline")} />
              ) : entries.length === 0 ? (
                <ListRow title="–" />
              ) : (
                entries.slice(0, 50).map((entry) => (
                  <ListRow
                    key={entry.id}
                    title={format.dateTime(new Date(entry.reviewed_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    detail={
                      <span className={RATING_COLOR[entry.rating]}>
                        {entry.rating ? review(RATING_LABEL[entry.rating] as "again") : t("forget")}
                      </span>
                    }
                  />
                ))
              )}
            </ListSection>
          </>
        ) : null}
      </SheetContent>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("forget")}
        message={t("forgetConfirm")}
        confirmLabel={t("forget")}
        onConfirm={() => void act("forget")}
      />
    </Sheet>
  );
}
