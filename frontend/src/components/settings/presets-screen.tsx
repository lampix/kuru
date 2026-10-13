"use client";

import { Check, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";

import {
  BarButton,
  InputRow,
  ListRow,
  ListSection,
  NavigationPage,
  SegmentedControl,
  SwitchRow,
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
      key={`${selected.id}:${selected.updated_at}`}
      preset={selected}
      presets={data.presets}
      deck={deck ? { id: deck.id, name: deck.name } : null}
      onClose={() => router.back()}
    />
  );
}

function PresetEditor({
  preset,
  presets,
  deck,
  onClose,
}: {
  preset: Preset;
  presets: Preset[];
  deck: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("options");
  const common = useTranslations("common");
  const { phase } = useSyncStatus();
  const offline = phase === "offline";
  const [draft, setDraft] = useState<Draft>(() => ({ ...preset }));
  const [learning, setLearning] = useState(formatSteps(preset.learning_steps));
  const [relearning, setRelearning] = useState(formatSteps(preset.relearning_steps));
  const [weights, setWeights] = useState(
    preset.weights_are_default ? "" : preset.fsrs_weights.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const persist = async (updated: Preset) => {
    await db.presets.put(updated);
    void syncNow();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const updated = await api.presets.update(preset.id, {
        ...draft,
        learning_steps: learningSteps ?? [],
        relearning_steps: relearningSteps ?? [],
        fsrs_weights: weightValues,
      });
      await persist(updated);
      setMessage(t("saved"));
    });

  const choosePreset = (id: number) =>
    run(async () => {
      if (!deck) return;
      await api.decks.update(deck.id, { config_id: id });
      await db.decks.update(deck.id, { config_id: id });
      void syncNow();
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
    });

  const optimize = () =>
    run(async () => {
      setMessage(t("optimizing"));
      const result = await api.presets.optimize(preset.id, true);
      setWeights(result.weights.map((w) => w.toFixed(4)).join(", "));
      setMessage(t("optimized", { count: result.review_count }));
      void syncNow();
    });

  const remove = () =>
    run(async () => {
      await api.presets.remove(preset.id);
      await db.presets.delete(preset.id);
      void syncNow();
      onClose();
    });

  const number = (value: string, fallback: number) =>
    value === "" || Number.isNaN(Number(value)) ? fallback : Number(value);
  const disabled = offline || busy;

  return (
    <NavigationPage
      title={deck ? deck.name.split("::").pop()! : t("title")}
      largeTitle={false}
      leading={<BarButton onClick={onClose}>{common("cancel")}</BarButton>}
      trailing={
        <BarButton bold disabled={!valid || disabled} onClick={() => void save()}>
          {common("save")}
        </BarButton>
      }
    >
      {offline ? (
        <p className="mt-3 px-4 text-footnote text-ios-orange">{t("onlineOnly")}</p>
      ) : null}
      {message ? (
        <p className="mt-3 px-4 text-footnote text-label-2" role="status">
          {message}
        </p>
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
          className="w-44"
          onChange={(e) => set("name", e.target.value)}
        />
      </ListSection>

      <ListSection header={t("dailyLimits")}>
        <InputRow
          title={t("newPerDay")}
          type="number"
          inputMode="numeric"
          min={0}
          disabled={disabled}
          value={draft.new_per_day}
          onChange={(e) => set("new_per_day", number(e.target.value, 0))}
        />
        <InputRow
          title={t("reviewsPerDay")}
          type="number"
          inputMode="numeric"
          min={0}
          disabled={disabled}
          value={draft.reviews_per_day}
          onChange={(e) => set("reviews_per_day", number(e.target.value, 0))}
        />
        <Row title={t("newCardOrder")}>
          <SegmentedControl
            ariaLabel={t("newCardOrder")}
            value={draft.new_card_order}
            onChange={(value) => set("new_card_order", value)}
            options={[
              { value: "sequential", label: t("orderSequential") },
              { value: "random", label: t("orderRandom") },
            ]}
            className="w-44 shrink-0"
          />
        </Row>
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
        <InputRow
          title={t("desiredRetention")}
          type="number"
          step={0.01}
          min={0.7}
          max={0.99}
          disabled={disabled}
          value={draft.desired_retention}
          onChange={(e) =>
            set("desired_retention", Math.min(0.99, Math.max(0.7, number(e.target.value, 0.9))))
          }
        />
        <InputRow
          title={t("maximumInterval")}
          type="number"
          min={1}
          max={36500}
          disabled={disabled}
          value={draft.maximum_interval}
          suffix={t("daysUnit")}
          onChange={(e) => set("maximum_interval", number(e.target.value, 36500))}
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
        <InputRow
          title={t("showAnswerTimer")}
          type="number"
          min={0}
          max={600}
          disabled={disabled}
          value={draft.show_answer_timer}
          suffix="s"
          onChange={(e) => set("show_answer_timer", number(e.target.value, 0))}
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

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="group/row flex items-center">
      <div className="flex min-h-11 flex-1 items-center gap-3 py-2 pr-3 pl-4 hairline-b group-last/row:shadow-none">
        <span className="flex-1 truncate">{title}</span>
        {children}
      </div>
    </div>
  );
}
