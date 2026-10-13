/** Built-in Anki template filters. */

import { activeClozeText, clozeOnly, renderCloze } from "./cloze";
import { escapeHtml, stripHtml } from "./html";
import { type FilterContext, type TemplateFilter, pluginFilter } from "./plugins";
import { TYPE_ANSWER_INPUT } from "./type-answer";

// Anki: ` ?([^ >]+?)\[(.+?)\]` — base text followed by its reading in brackets.
const FURIGANA = / ?([^ >]+?)\[(.+?)\]/g;

const furigana: TemplateFilter = (text) =>
  text.replace(FURIGANA, (_m, base: string, reading: string) =>
    reading.startsWith("sound:") ? _m : `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`,
  );
const kana: TemplateFilter = (text) =>
  text.replace(FURIGANA, (m, _b: string, reading: string) => (reading.startsWith("sound:") ? m : reading));
const kanji: TemplateFilter = (text) =>
  text.replace(FURIGANA, (m, base: string, reading: string) => (reading.startsWith("sound:") ? m : base));

export const TYPE_ANSWER_MARKER = "\u0000kuru-typeans\u0000";

export const BUILTIN_FILTERS: Record<string, TemplateFilter> = {
  text: (text) => escapeHtml(stripHtml(text)),
  cloze: (text, ctx) => (ctx.isCloze ? renderCloze(text, ctx.ord + 1, ctx.side) : text),
  "cloze-only": (text, ctx) => escapeHtml(clozeOnly(text, ctx.ord + 1)),
  furigana,
  kana,
  kanji,
  hint: (text, ctx) =>
    text.trim()
      ? `<details class="hint"><summary>${escapeHtml(ctx.fieldName)}</summary>${text}</details>`
      : "",
  // Text-to-speech is not supported; the field is hidden like in Anki clients without TTS.
  tts: () => "",
  "tts-voices": () => "",
};

/** `{{type:Field}}` / `{{type:cloze:Field}}`: returns the expected answer via `expected`. */
export function typeAnswer(
  value: string,
  ctx: FilterContext,
  cloze: boolean,
): { html: string; expected: string } {
  const expected = cloze ? activeClozeText(value, ctx.ord + 1) : stripHtml(value);
  return { html: ctx.side === "question" ? TYPE_ANSWER_INPUT : TYPE_ANSWER_MARKER, expected };
}

/** Resolve a filter by name: plugins first (so they can override built-ins), then built-ins. */
export function resolveFilter(name: string): TemplateFilter | undefined {
  return pluginFilter(name) ?? BUILTIN_FILTERS[name];
}
