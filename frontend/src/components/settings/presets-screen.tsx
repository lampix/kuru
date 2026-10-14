"use client";

import { Check, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  InputRow,
  ListRow,
  ListSection,
  NavigationPage,
  SegmentedControl,
  StackedRow,
  SwitchRow,
  useToast,
} from "@/components/ios";
import { useRouter } from "@/i18n/navigation";
import { ApiError, api } from "@/lib/api/client";
import type { Preset } from "@/lib/api/types";
import { db } from "@/lib/db";
import { presetForDeck } from "@/lib/study/deck-tree";
import { syncNow } from "@/lib/sync/manager";
import { useSyncStatus } from "@/lib/sync/hooks";

type Draft = Omit<
  Preset,
  "id" | "deck_count" | "is_default" | "updated_at" | "weights_are_default"
>;

const parseSteps = (text: string): number[] | null => {
  const values = text.trim()
    ? text
        .trim()
        .split(/[\s,]+/)
        .map(Number)
    : [];
  return values.every((v) => Number.isFinite(v) && v > 0) ? values : null;
};
const formatSteps = (steps: readonly number[]) => steps.join(" ");

/** The editable fields of a preset (read-only ones are never sent back). */
function toDraft(p: Preset): Draft {
  return {
    name: p.name,
    desired_retention: p.desired_retention,
    maximum_interval: p.maximum_interval,
    fsrs_weights: p.fsrs_weights,
    learning_steps: p.learning_steps,
    relearning_steps: p.relearning_steps,
    enable_fuzz: p.enable_fuzz,
    new_per_day: p.new_per_day,
    reviews_per_day: p.reviews_per_day,
    new_card_order: p.new_card_order,
    bury_new: p.bury_new,
    bury_reviews: p.bury_reviews,
    bury_interday_learning: p.bury_interday_learning,
    autoplay_audio: p.autoplay_audio,
    show_answer_timer: p.show_answer_timer,
  };
}

/**
 * Deck options. `?deck=ID` shows the preset used by that deck (and lets you switch it);
 * `?preset=ID` edits a preset directly; without parameters all presets are listed.
 */
export function PresetsScreen() {
  const t = useTranslations("options");
  const settings = useTranslations("settings");
  const params = useSearchParams();
  const router = useRouter();
  const deckId = Number(params.get("deck")) || null;
  const presetId = Number(params.get("preset")) || null;
  const data = useLiveQuery(async () => ({
    presets: await db.presets.toArray(),
    decks: await db.decks.toArray(),
  }));

  if (!data) return null;
  const deck = deckId ? data.decks.find((d) => d.id === deckId) : undefined;
  const selected = deck
    ? presetForDeck(deck, data.presets)
    : presetId
      ? data.presets.find((p) => p.id === presetId)
      : undefined;

  if (!selected) {
    return (
      <NavigationPage
        title={settings("presets")}
        largeTitle={false}
        back={{ href: "/settings", label: settings("title") }}
      >
        <ListSection>
          {data.presets.map((preset) => (
            <ListRow
              key={preset.id}
              title={preset.name}
              subtitle={t("usedBy", { count: preset.deck_count })}
              href={`/settings/presets?preset=${preset.id}`}
            />
          ))}
        </ListSection>
      </NavigationPage>
    );
  }

  return (
    <PresetEditor
      // Keyed by id only: auto-saves update `updated_at` and must not remount the form.
      key={selected.id}
      preset={selected}
      presets={data.presets}
      deck={deck ? { id: deck.id, name: deck.name } : null}
      onDeleted={() => router.replace("/settings/presets")}
    />
  );
}

const SAVE_DELAY_MS = 600;

function PresetEditor({
  preset,
  presets,
  deck,
  onDeleted,
}: {
  preset: Preset;
  presets: Preset[];
  deck: { id: number; name: string } | null;
  onDeleted: () => void;
}) {
  const t = useTranslations("options");
  const decksT = useTranslations("decks");
  const settingsT = useTranslations("settings");
  const { phase } = useSyncStatus();
  const { toast, show } = useToast();
  const offline = phase === "offline";
  const [draft, setDraft] = useState<Draft>(() => toDraft(preset));
  const [learning, setLearning] = useState(formatSteps(preset.learning_steps));
  const [relearning, setRelearning] = useState(formatSteps(preset.relearning_steps));
  const [weights, setWeights] = useState(
    preset.weights_are_default ? "" : preset.fsrs_weights.join(", "),
  );
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const learningSteps = parseSteps(learning);
  const relearningSteps = parseSteps(relearning);
  const weightValues = weights.trim()
    ? weights
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
    : [];
  const weightsValid =
    weightValues.length === 0 ||
    (weightValues.length === 21 && weightValues.every(Number.isFinite));
  const valid =
    learningSteps !== null && relearningSteps !== null && weightsValid && draft.name.trim() !== "";

  // ---- auto-save (iOS Settings style) ------------------------------------------------------
  const payload: Partial<Preset> = {
    ...draft,
    name: draft.name.trim(),
    learning_steps: learningSteps ?? [],
    relearning_steps: relearningSteps ?? [],
    fsrs_weights: weightValues,
  };
  const payloadKey = JSON.stringify(payload);
  const [savedKey, setSavedKey] = useState(payloadKey);
  const pending = useRef<{ key: string; payload: Partial<Preset> } | null>(null);

  const save = useCallback(
    async (body: Partial<Preset>, key: string, quiet = false) => {
      try {
        const updated = await api.presets.update(preset.id, body);
        setSavedKey(key);
        await db.presets.put(updated);
        void syncNow();
        if (!quiet) show(t("saved"));
      } catch (error) {
        if (!quiet) show(error instanceof ApiError ? error.message : t("saveFailed"), "error");
      }
    },
    [preset.id, show, t],
  );

  const dirty = valid && payloadKey !== savedKey;
  useEffect(() => {
    pending.current = dirty ? { key: payloadKey, payload } : null;
    if (!dirty || offline) return;
    const timer = setTimeout(() => {
      pending.current = null;
      void save(payload, payloadKey);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // `payload` is derived from `payloadKey`; depending on the key avoids a save per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, dirty, offline, save]);

  // Leaving the screen within the debounce window still saves the last change.
  useEffect(
    () => () => {
      const last = pending.current;
      if (last) void save(last.payload, last.key, true);
    },
    [save],
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      show(error instanceof ApiError ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const choosePreset = (id: number) =>
    run(async () => {
      if (!deck) return;
      await api.decks.update(deck.id, { config_id: id });
      await db.decks.update(deck.id, { config_id: id });
      void syncNow();
      show(t("saved"));
    });

  const createPreset = () =>
    run(async () => {
      const created = await api.presets.create({ name: `${preset.name} 2`, copy_from: preset.id });
      await db.presets.put(created);
      if (deck) {
        await api.decks.update(deck.id, { config_id: created.id });
        await db.decks.update(deck.id, { config_id: created.id });
      }
      void syncNow();
      show(t("saved"));
    });

  const optimize = () =>
    run(async () => {
      show(t("optimizing"));
      const result = await api.presets.optimize(preset.id, true);
      const optimized = result.weights.map((w) => w.toFixed(4)).join(", ");
      setWeights(optimized);
      // Already stored by the server: mark as saved so auto-save does not resend it.
      setSavedKey(JSON.stringify({ ...payload, fsrs_weights: optimized.split(", ").map(Number) }));
      show(t("optimized", { count: result.review_count }));
      void syncNow();
    });

  const remove = () =>
    run(async () => {
      await api.presets.remove(preset.id);
      await db.presets.delete(preset.id);
      void syncNow();
      onDeleted();
    });

  const disabled = offline || busy;

  return (
    <NavigationPage
      title={deck ? deck.name.split("::").pop()! : t("title")}
      largeTitle={false}
      back={
        deck
          ? { href: "/", label: decksT("title") }
          : { href: "/settings/presets", label: settingsT("presets") }
      }
    >
      {toast}
      {offline ? (
        <p className="mt-3 px-4 text-footnote text-ios-orange">{t("onlineOnly")}</p>
      ) : null}

      {deck ? (
        <ListSection header={t("preset")} footer={t("usedBy", { count: preset.deck_count })}>
          {presets.map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              disabled={disabled}
              onClick={() => void choosePreset(p.id)}
              accessory={
                p.id === preset.id ? <Check className="size-5 text-tint" strokeWidth={2.6} /> : null
              }
            />
          ))}
          <ListRow
            title={t("newPreset")}
            tinted
            disabled={disabled}
            icon={<Plus className="size-5 text-tint" />}
            onClick={() => void createPreset()}
          />
        </ListSection>
      ) : null}

      <ListSection>
        <InputRow
          title={t("presetName")}
          value={draft.name}
          disabled={disabled}
          className="w-full"
          aria-invalid={draft.name.trim() === ""}
          onChange={(e) => set("name", e.target.value)}
        />
      </ListSection>

      <ListSection header={t("dailyLimits")}>
        <NumberRow
          title={t("newPerDay")}
          min={0}
          max={9999}
          disabled={disabled}
          value={draft.new_per_day}
          onValue={(v) => set("new_per_day", v)}
        />
        <NumberRow
          title={t("reviewsPerDay")}
          min={0}
          max={99999}
          disabled={disabled}
          value={draft.reviews_per_day}
          onValue={(v) => set("reviews_per_day", v)}
        />
        <StackedRow title={t("newCardOrder")}>
          <SegmentedControl
            ariaLabel={t("newCardOrder")}
            value={draft.new_card_order}
            onChange={(value) => set("new_card_order", value)}
            options={[
              { value: "sequential", label: t("orderSequential") },
              { value: "random", label: t("orderRandom") },
            ]}
          />
        </StackedRow>
      </ListSection>

      <ListSection header={t("steps")} footer={t("stepsFooter")}>
        <InputRow
          title={t("learningSteps")}
          value={learning}
          disabled={disabled}
          aria-invalid={learningSteps === null}
          onChange={(e) => setLearning(e.target.value)}
        />
        <InputRow
          title={t("relearningSteps")}
          value={relearning}
          disabled={disabled}
          aria-invalid={relearningSteps === null}
          onChange={(e) => setRelearning(e.target.value)}
        />
      </ListSection>

      <ListSection header={t("fsrs")} footer={t("weightsFooter")}>
        <NumberRow
          title={t("desiredRetention")}
          step={0.01}
          min={0.7}
          max={0.99}
          decimal
          disabled={disabled}
          value={draft.desired_retention}
          onValue={(v) => set("desired_retention", v)}
        />
        <NumberRow
          title={t("maximumInterval")}
          min={1}
          max={36500}
          disabled={disabled}
          value={draft.maximum_interval}
          suffix={t("daysUnit")}
          onValue={(v) => set("maximum_interval", v)}
        />
        <SwitchRow
          title={t("fuzz")}
          checked={draft.enable_fuzz}
          disabled={disabled}
          onCheckedChange={(v) => set("enable_fuzz", v)}
        />
        <div className="px-4 py-3">
          <label className="mb-1 block text-subhead text-label-2">
            {weights.trim() ? t("weightsCustom") : t("weightsDefault")}
          </label>
          <textarea
            value={weights}
            disabled={disabled}
            rows={3}
            placeholder={preset.fsrs_weights.map((w) => w.toFixed(4)).join(", ")}
            aria-invalid={!weightsValid}
            onChange={(e) => setWeights(e.target.value)}
            className="w-full rounded-lg bg-fill-3 p-2 font-mono text-footnote outline-none aria-invalid:text-ios-red"
          />
        </div>
        <ListRow title={t("optimize")} tinted disabled={disabled} onClick={() => void optimize()} />
      </ListSection>

      <ListSection header={t("burying")}>
        <SwitchRow
          title={t("buryNew")}
          checked={draft.bury_new}
          disabled={disabled}
          onCheckedChange={(v) => set("bury_new", v)}
        />
        <SwitchRow
          title={t("buryReviews")}
          checked={draft.bury_reviews}
          disabled={disabled}
          onCheckedChange={(v) => set("bury_reviews", v)}
        />
        <SwitchRow
          title={t("buryInterday")}
          checked={draft.bury_interday_learning}
          disabled={disabled}
          onCheckedChange={(v) => set("bury_interday_learning", v)}
        />
      </ListSection>

      <ListSection header={t("display")}>
        <SwitchRow
          title={t("autoplay")}
          checked={draft.autoplay_audio}
          disabled={disabled}
          onCheckedChange={(v) => set("autoplay_audio", v)}
        />
        <NumberRow
          title={t("showAnswerTimer")}
          min={0}
          max={600}
          disabled={disabled}
          value={draft.show_answer_timer}
          suffix="s"
          onValue={(v) => set("show_answer_timer", v)}
        />
      </ListSection>

      {!preset.is_default ? (
        <ListSection>
          <ListRow
            title={t("deletePreset")}
            destructive
            disabled={disabled}
            onClick={() => void remove()}
          />
        </ListSection>
      ) : null}
    </NavigationPage>
  );
}

/**
 * A number input that keeps its own text while typing (so clearing the field to type a new value
 * does not snap it to 0) and only reports valid, in-range values.
 */
function NumberRow({
  title,
  value,
  onValue,
  min,
  max,
  step,
  decimal,
  suffix,
  disabled,
}: {
  title: string;
  value: number;
  onValue: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  decimal?: boolean;
  suffix?: string;
  disabled?: boolean;
}) {
  const [invalid, setInvalid] = useState(false);
  return (
    <InputRow
      title={title}
      type="number"
      inputMode={decimal ? "decimal" : "numeric"}
      min={min}
      max={max}
      step={step}
      suffix={suffix}
      disabled={disabled}
      defaultValue={value}
      aria-invalid={invalid}
      onChange={(e) => {
        const parsed = Number(e.target.value.replace(",", "."));
        const ok =
          e.target.value.trim() !== "" &&
          Number.isFinite(parsed) &&
          parsed >= min &&
          parsed <= max &&
          (decimal || Number.isInteger(parsed));
        setInvalid(!ok);
        if (ok) onValue(parsed);
      }}
    />
  );
}
