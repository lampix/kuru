"use client";

import { Ellipsis, PartyPopper, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IosButton, iosButton } from "@/components/ios";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { AudioPlayer } from "@/lib/audio";
import { CardState, type Rating } from "@/lib/fsrs";
import { renderCard } from "@/lib/render";
import { usePracticeSession } from "@/lib/study/use-practice-session";
import { useStudySession } from "@/lib/study/use-study-session";
import { cn } from "@/lib/utils";

import { AnswerButtons } from "./answer-buttons";
import { CardView } from "./card-view";

const RATING_KEYS: Record<string, Rating> = { "1": 1, "2": 2, "3": 3, "4": 4 };
/** Practice: Again/Hard come back in the session, Good/Easy finish the card (see practice.ts). */
const PRACTICE_LABELS: Record<Rating, string> = { 1: "1m", 2: "10m", 3: "✓", 4: "✓" };

export function StudyScreen() {
  const t = useTranslations("review");
  const common = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const params = useSearchParams();
  const deckParam = Number(params.get("deck"));
  const deckId = Number.isFinite(deckParam) && deckParam > 0 ? deckParam : null;
  // `?custom=forgotten&days=N` starts a practice session (custom study) instead of the daily queue.
  const practice = params.get("custom") === "forgotten";
  const days = Math.min(30, Math.max(1, Number(params.get("days")) || 1));
  // Both hooks always run (rules of hooks); the inactive one gets no deck and stays idle.
  const regular = useStudySession(practice ? null : deckId);
  const practiceSession = usePracticeSession(practice ? deckId : null, "forgotten", days);
  const session = practice ? practiceSession : regular;
  const { current, next, preset, scheduler } = session;

  // `showing` makes a card that comes back in the same session start unrevealed again.
  const cardKey = current ? `${current.id}:${current.reps}:${session.showing}` : null;
  // Per-card UI state is keyed by the card, so it resets automatically when the card changes.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState<{ key: string | null; value: string }>({
    key: null,
    value: "",
  });
  const revealed = cardKey !== null && revealedKey === cardKey;
  const typed = typedAnswer.key === cardKey ? typedAnswer.value : "";
  const setTyped = useCallback(
    (value: string) => setTypedAnswer({ key: cardKey, value }),
    [cardKey],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const shownAt = useRef(0);
  const audio = useMemo(() => new AudioPlayer(), []);

  const playLabel = t("replayAudio");
  const rendered = useMemo(() => {
    if (!current) return null;
    const noteType = session.noteType(current);
    if (!noteType) return null;
    return renderCard(noteType, current, {
      deckName: session.deckName(current),
      typedAnswer: typed,
      playLabel,
    });
  }, [current, session, typed, playLabel]);

  // New card shown: start the answer timer.
  useEffect(() => {
    if (cardKey) shownAt.current = performance.now();
  }, [cardKey]);

  useEffect(() => {
    if (!rendered || revealed) return;
    if (preset?.autoplay_audio) void audio.playSequence(rendered.questionSounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the card changes
  }, [cardKey]);

  const noteTypeOf = session.noteType;
  useEffect(() => {
    if (!next) return;
    const noteType = noteTypeOf(next);
    if (!noteType) return;
    const upcoming = renderCard(noteType, next);
    audio.preload([...upcoming.questionSounds, ...upcoming.answerSounds]);
  }, [next, noteTypeOf, audio]);

  useEffect(() => () => audio.stop(), [audio]);

  const reveal = useCallback(() => {
    if (!rendered || revealed) return;
    setRevealedKey(cardKey);
    if (preset?.autoplay_audio) void audio.playSequence(rendered.answerSounds);
    else audio.stop();
  }, [rendered, revealed, preset, audio, cardKey]);

  // "Show answer automatically" timer from the deck preset.
  useEffect(() => {
    if (!cardKey || revealed || !preset?.show_answer_timer) return;
    const timer = setTimeout(reveal, preset.show_answer_timer * 1000);
    return () => clearTimeout(timer);
  }, [cardKey, revealed, preset, reveal]);

  const answer = useCallback(
    (rating: Rating) => {
      if (!revealed) return;
      audio.stop();
      void session.answer(rating, performance.now() - shownAt.current);
    },
    [revealed, audio, session],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        if ((event.metaKey || event.ctrlKey) && event.key === "z") {
          event.preventDefault();
          void session.undo();
        }
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (revealed) answer(3);
        else reveal();
      } else if (revealed && RATING_KEYS[event.key]) {
        answer(RATING_KEYS[event.key]!);
      } else if (event.key === "z" || event.key === "u") {
        void session.undo();
      } else if (event.key === "r" && rendered) {
        void audio.playSequence(revealed ? rendered.answerSounds : rendered.questionSounds);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, answer, session, rendered, audio]);

  const cardAction = async (action: "suspend" | "bury") => {
    setMenuOpen(false);
    if (!current) return;
    const tomorrow = new Date(Date.now() + 24 * 3_600_000).toISOString();
    await session.dismissCurrent(
      action === "suspend" ? { suspended: true } : { buried_until: tomorrow },
    );
    void api.cardActions([current.id], action).catch(() => undefined);
  };

  const { counts } = session;
  const activeQueue =
    current?.state === CardState.New
      ? "new"
      : current?.state === CardState.Review
        ? "review"
        : "learning";

  return (
    <div className="flex h-dvh flex-col bg-grouped">
      <header className="pt-safe">
        <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-3">
          <button
            type="button"
            onClick={() =>
              router.push(deckId ? { pathname: "/deck", query: { deck: deckId } } : "/")
            }
            aria-label={common("close")}
            title={common("close")}
            className="flex size-8 items-center justify-center rounded-full bg-fill-3 text-label-2 active:opacity-50"
          >
            <X className="size-[18px]" strokeWidth={2.5} />
          </button>
          <div className="flex flex-1 flex-col items-center leading-tight">
            <span className="truncate text-subhead font-semibold">
              {session.deck?.name.split("::").pop()}
            </span>
            {session.mode === "practice" ? (
              <span className="text-footnote font-semibold text-ios-indigo tabular-nums">
                {t("practiceCount", { count: session.remaining })}
              </span>
            ) : (
              <span
                className="flex gap-2.5 text-footnote font-semibold tabular-nums"
                aria-label={t("remaining", {
                  new: counts.new,
                  learning: counts.learning,
                  review: counts.review,
                })}
              >
                <span
                  className={cn(
                    "text-ios-blue",
                    activeQueue === "new" && current && "underline underline-offset-4",
                  )}
                >
                  {counts.new}
                </span>
                <span
                  className={cn(
                    "text-ios-red",
                    activeQueue === "learning" && current && "underline underline-offset-4",
                  )}
                >
                  {counts.learning}
                </span>
                <span
                  className={cn(
                    "text-ios-green",
                    activeQueue === "review" && current && "underline underline-offset-4",
                  )}
                >
                  {counts.review}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void session.undo()}
            disabled={!session.canUndo}
            aria-label={t("undo")}
            title={t("undo")}
            className="flex size-8 items-center justify-center text-tint active:opacity-50 disabled:opacity-30"
          >
            <Undo2 className="size-5" />
          </button>
          {session.mode === "practice" ? (
            // Bury/suspend would change the card outside the practice session: not offered here.
            <span className="size-8" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              disabled={!current}
              aria-label={t("moreActions")}
              title={t("moreActions")}
              className="flex size-8 items-center justify-center text-tint active:opacity-50 disabled:opacity-30"
            >
              <Ellipsis className="size-5" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-3 pt-2">
        {session.status === "ready" && !current ? (
          <Finished
            nextDue={session.nextLearningDue}
            format={format}
            deckId={deckId}
            practice={session.mode === "practice"}
          />
        ) : session.status === "missing" ? (
          <Finished nextDue={null} format={format} deckId={null} practice={false} />
        ) : (
          <div className="relative flex-1 [perspective:1600px]">
            <AnimatePresence mode="popLayout" initial={false}>
              {rendered ? (
                <motion.div
                  key={`${cardKey}:${revealed ? "a" : "q"}`}
                  initial={{
                    rotateY: revealed ? -90 : 0,
                    opacity: revealed ? 1 : 0,
                    scale: revealed ? 1 : 0.96,
                  }}
                  animate={{ rotateY: 0, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="absolute inset-0 overflow-y-auto rounded-[22px] bg-grouped-2 shadow-[0_1px_3px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.06)] [backface-visibility:hidden]"
                  onClick={(event) => {
                    if (!revealed && !(event.target as HTMLElement).closest?.("input,button"))
                      reveal();
                  }}
                >
                  <CardView
                    html={revealed ? rendered.answer : rendered.question}
                    css={rendered.css}
                    onPlaySound={(name) => void audio.play(name)}
                    onTypedAnswer={setTyped}
                    onSubmitTypedAnswer={reveal}
                    className="min-h-full"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-2xl px-3 pt-3 pb-safe">
        <div className="pb-3">
          {current && scheduler ? (
            revealed ? (
              <AnswerButtons
                card={current}
                scheduler={scheduler}
                onAnswer={answer}
                labels={session.mode === "practice" ? PRACTICE_LABELS : undefined}
              />
            ) : (
              <IosButton
                size="lg"
                variant="filled"
                onClick={reveal}
                className="h-[58px] rounded-[14px]"
              >
                {t("showAnswer")}
              </IosButton>
            )
          ) : null}
        </div>
      </footer>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-[14px] border-0 bg-grouped p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
        >
          <SheetTitle className="sr-only">{t("moreActions")}</SheetTitle>
          <div className="overflow-hidden rounded-[14px] bg-grouped-2">
            <button
              type="button"
              className="w-full py-4 text-tint hairline-b active:bg-fill-3"
              onClick={() => void cardAction("bury")}
            >
              {t("bury")}
            </button>
            <button
              type="button"
              className="w-full py-4 text-ios-red active:bg-fill-3"
              onClick={() => void cardAction("suspend")}
            >
              {t("suspend")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Finished({
  nextDue,
  format,
  deckId,
  practice,
}: {
  nextDue: Date | null;
  format: ReturnType<typeof useFormatter>;
  deckId: number | null;
  practice: boolean;
}) {
  const t = useTranslations("review");
  const decks = useTranslations("decks");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <PartyPopper className="size-14 text-ios-orange" strokeWidth={1.5} aria-hidden />
      <h1 className="text-title-2 font-bold">{practice ? t("practiceDone") : t("finished")}</h1>
      <p className="max-w-xs text-label-2">
        {practice ? t("practiceDoneHint") : t("finishedHint")}
      </p>
      {nextDue ? (
        <p className="text-subhead text-label-2">
          {t("nextLearning", { time: format.relativeTime(nextDue, new Date()) })}
        </p>
      ) : null}
      <Link
        href={deckId ? { pathname: "/deck", query: { deck: deckId } } : "/"}
        className={cn(iosButton({ variant: "tinted" }), "mt-4")}
      >
        {deckId ? t("backToDeck") : decks("title")}
      </Link>
    </div>
  );
}
