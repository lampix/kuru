/**
 * Rendering Anki cards: template → HTML (sanitised) + CSS + the sounds to auto-play.
 */

import { TYPE_ANSWER_MARKER } from "./filters";
import { extractSounds, replaceSoundTags, rewriteCssUrls } from "./media";
import { type CardSide, type RenderContext, registeredPlugins } from "./plugins";
import { sanitizeCardHtml } from "./sanitize";
import { TemplateError, renderTemplate } from "./template";
import { compareAnswer } from "./type-answer";

export * from "./cloze";
export * from "./media";
export * from "./plugins";
export { TemplateError, parseTemplate, renderTemplate } from "./template";

export interface NoteTypeLike {
  name: string;
  kind: number; // 0 standard, 1 cloze
  fields: ReadonlyArray<{ name: string; ord: number }>;
  templates: ReadonlyArray<{ name: string; ord: number; qfmt: string; afmt: string }>;
  css: string;
}

export interface CardLike {
  ord: number;
  fields: readonly string[];
  tags: readonly string[];
}

export interface RenderOptions {
  deckName?: string;
  /** Text the user typed for `{{type:…}}` (answer side). */
  typedAnswer?: string;
  playLabel?: string;
}

export interface RenderedCard {
  question: string;
  answer: string;
  css: string;
  questionSounds: string[];
  /** Sounds on the answer side, excluding those inherited through `{{FrontSide}}`. */
  answerSounds: string[];
  hasTypeAnswer: boolean;
}

const FRONT_MARKER = "\u0000kuru-frontside\u0000";

function context(noteType: NoteTypeLike, card: CardLike, side: CardSide, deckName: string) {
  const isCloze = noteType.kind === 1;
  const template = isCloze
    ? noteType.templates[0]
    : noteType.templates.find((t) => t.ord === card.ord);
  const fields: Record<string, string> = {};
  [...noteType.fields]
    .sort((a, b) => a.ord - b.ord)
    .forEach((field, index) => (fields[field.name] = card.fields[index] ?? ""));
  let ctx: RenderContext = {
    side,
    fields,
    tags: [...card.tags],
    noteTypeName: noteType.name,
    templateName: template?.name ?? "",
    deckName,
    ord: card.ord,
    isCloze,
  };
  for (const plugin of registeredPlugins()) ctx = plugin.beforeRender?.(ctx) ?? ctx;
  return { ctx, template };
}

function afterRender(html: string, ctx: RenderContext): string {
  return registeredPlugins().reduce((out, plugin) => plugin.afterRender?.(out, ctx) ?? out, html);
}

export function renderCard(
  noteType: NoteTypeLike,
  card: CardLike,
  options: RenderOptions = {},
): RenderedCard {
  const deckName = options.deckName ?? "";
  const label = options.playLabel ?? "Play";
  const q = context(noteType, card, "question", deckName);
  if (!q.template) {
    const error = `<div class="kuru-template-error">Template ${card.ord + 1} not found</div>`;
    return {
      question: error,
      answer: error,
      css: "",
      questionSounds: [],
      answerSounds: [],
      hasTypeAnswer: false,
    };
  }

  const safeRender = (template: string, ctx: RenderContext, front: string | null) => {
    try {
      return renderTemplate(template, ctx, front);
    } catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      return {
        html: `<div class="kuru-template-error">${error.message}</div>`,
        expectedAnswer: null,
      };
    }
  };

  const question = safeRender(q.template.qfmt, q.ctx, null);
  const questionHtml = afterRender(question.html, q.ctx);
  const questionSounds = extractSounds(questionHtml);
  const questionRendered = replaceSoundTags(questionHtml, label);

  const a = context(noteType, card, "answer", deckName);
  const answer = safeRender(a.template!.afmt, a.ctx, FRONT_MARKER);
  let answerHtml = afterRender(answer.html, a.ctx);
  const answerSounds = extractSounds(answerHtml);
  answerHtml = replaceSoundTags(answerHtml, label);
  const expected = answer.expectedAnswer ?? question.expectedAnswer;
  if (expected !== null) {
    answerHtml = answerHtml.replace(
      TYPE_ANSWER_MARKER,
      compareAnswer(expected, options.typedAnswer ?? ""),
    );
  }
  // The answer's FrontSide shows the question without the type-answer input.
  const frontForAnswer = questionRendered.replace(/<input[^>]*id="typeans"[^>]*>/, "");
  answerHtml = answerHtml.replaceAll(FRONT_MARKER, frontForAnswer);

  return {
    question: sanitizeCardHtml(questionRendered),
    answer: sanitizeCardHtml(answerHtml),
    css: rewriteCssUrls(noteType.css),
    questionSounds,
    answerSounds,
    hasTypeAnswer: expected !== null,
  };
}
