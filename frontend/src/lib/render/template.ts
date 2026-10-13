/**
 * Anki card template engine.
 *
 * Supports field replacements (`{{Field}}`), filters (`{{text:Field}}`, chained right to left),
 * conditional sections (`{{#Field}}…{{/Field}}`, `{{^Field}}…{{/Field}}`), the special fields
 * `FrontSide`, `Tags`, `Type`, `Deck`, `Subdeck`, `Card` and `CardFlag`, and comments `{{!…}}`.
 */

import { BUILTIN_FILTERS, resolveFilter, typeAnswer } from "./filters";
import { isFieldEmpty } from "./html";
import type { FilterContext, RenderContext } from "./plugins";

type Node =
  | { kind: "text"; value: string }
  | { kind: "field"; name: string; filters: string[] }
  | { kind: "section"; name: string; inverted: boolean; children: Node[] };

const TAG = /\{\{([^{}]*)\}\}/g;

export class TemplateError extends Error {}

export function parseTemplate(template: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ name: string; children: Node[] }> = [];
  const target = () => (stack.length ? stack[stack.length - 1]!.children : root);
  let last = 0;
  for (const match of template.matchAll(TAG)) {
    if (match.index > last) target().push({ kind: "text", value: template.slice(last, match.index) });
    last = match.index + match[0].length;
    const body = match[1]!.trim();
    if (!body || body.startsWith("!")) continue;
    const sigil = body[0];
    if (sigil === "#" || sigil === "^") {
      const node: Node = {
        kind: "section",
        name: body.slice(1).trim(),
        inverted: sigil === "^",
        children: [],
      };
      target().push(node);
      stack.push(node);
    } else if (sigil === "/") {
      const name = body.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new TemplateError(`Unexpected {{/${name}}}`);
      }
    } else {
      const parts = body.split(":");
      const name = parts.pop()!.trim();
      target().push({ kind: "field", name, filters: parts.map((p) => p.trim()) });
    }
  }
  if (last < template.length) target().push({ kind: "text", value: template.slice(last) });
  if (stack.length) throw new TemplateError(`Missing {{/${stack[stack.length - 1]!.name}}}`);
  return root;
}

export interface TemplateResult {
  html: string;
  /** Expected answer when the template contains `{{type:…}}`. */
  expectedAnswer: string | null;
}

/** Look up a field, special field or (case-insensitively) a field with similar name. */
function fieldValue(name: string, ctx: RenderContext, frontSide: string | null): string | null {
  if (name in ctx.fields) return ctx.fields[name]!;
  switch (name) {
    case "FrontSide":
      return frontSide ?? "";
    case "Tags":
      return ctx.tags.join(" ");
    case "Type":
      return ctx.noteTypeName;
    case "Deck":
      return ctx.deckName;
    case "Subdeck":
      return ctx.deckName.split("::").pop() ?? ctx.deckName;
    case "Card":
      return ctx.templateName;
    case "CardFlag":
      return "";
  }
  const lower = name.toLowerCase();
  const key = Object.keys(ctx.fields).find((k) => k.toLowerCase() === lower);
  return key === undefined ? null : ctx.fields[key]!;
}

export function renderTemplate(
  template: string,
  ctx: RenderContext,
  frontSide: string | null = null,
): TemplateResult {
  let expectedAnswer: string | null = null;

  const renderNodes = (nodes: Node[]): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case "text":
            return node.value;
          case "section": {
            const value = fieldValue(node.name, ctx, frontSide);
            const present = value !== null && !isFieldEmpty(value);
            return present !== node.inverted ? renderNodes(node.children) : "";
          }
          case "field": {
            const value = fieldValue(node.name, ctx, frontSide);
            if (value === null) {
              return `<span class="kuru-template-error">{{${[...node.filters, node.name].join(":")}}}: unknown field</span>`;
            }
            return applyFilters(node, value);
          }
        }
      })
      .join("");

  const applyFilters = (node: Extract<Node, { kind: "field" }>, value: string): string => {
    const base: Omit<FilterContext, "args"> = { ...ctx, fieldName: node.name };
    const filters = [...node.filters];
    // `type:` must be the outermost filter (optionally `type:cloze:`).
    if (filters[0] === "type") {
      const cloze = filters[1] === "cloze";
      const result = typeAnswer(value, { ...base, args: "" }, cloze);
      expectedAnswer = result.expected;
      return result.html;
    }
    let text = value;
    for (const spec of filters.reverse()) {
      const [name = "", ...rest] = spec.split(" ");
      const filter = resolveFilter(name);
      // Unknown filters are ignored, matching Anki's lenient behaviour.
      if (filter) text = filter(text, { ...base, args: rest.join(" ") });
    }
    return text;
  };

  return { html: renderNodes(parseTemplate(template)), expectedAnswer };
}

export { BUILTIN_FILTERS };
