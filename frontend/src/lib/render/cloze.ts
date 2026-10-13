/**
 * Cloze deletions: `{{c1::text}}`, `{{c1::text::hint}}`, `{{c1,2::shared}}` and nesting.
 * Output markup matches Anki's so deck CSS targeting `.cloze` keeps working.
 */

import { escapeHtml, stripHtml } from "./html";

type ClozeNode = string | { ordinals: number[]; children: ClozeNode[]; hint?: string };

const OPEN = /\{\{c(\d+(?:,\d+)*)::/y;

export function parseCloze(text: string): ClozeNode[] {
  const root: ClozeNode[] = [];
  const stack: Array<{ ordinals: number[]; children: ClozeNode[] }> = [];
  const current = () => (stack.length ? stack[stack.length - 1]!.children : root);
  let buffer = "";
  const flush = () => {
    if (buffer) current().push(buffer);
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    OPEN.lastIndex = i;
    const open = OPEN.exec(text);
    if (open) {
      flush();
      stack.push({ ordinals: open[1]!.split(",").map(Number), children: [] });
      i = OPEN.lastIndex;
      continue;
    }
    if (text.startsWith("}}", i) && stack.length) {
      flush();
      const node = stack.pop()!;
      let hint: string | undefined;
      const last = node.children[node.children.length - 1];
      if (typeof last === "string") {
        const at = last.lastIndexOf("::");
        if (at >= 0) {
          hint = last.slice(at + 2);
          const rest = last.slice(0, at);
          node.children[node.children.length - 1] = rest;
          if (!rest) node.children.pop();
        }
      }
      current().push({ ...node, hint });
      i += 2;
      continue;
    }
    buffer += text[i];
    i += 1;
  }
  flush();
  // Unclosed clozes are rendered literally.
  while (stack.length) {
    const node = stack.pop()!;
    current().push(`{{c${node.ordinals.join(",")}::`, ...node.children);
  }
  return root;
}

function plain(nodes: ClozeNode[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : plain(n.children))).join("");
}

function render(nodes: ClozeNode[], ordinal: number, side: "question" | "answer"): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") return node;
      const active = node.ordinals.includes(ordinal);
      const inner = render(node.children, ordinal, side);
      const ord = node.ordinals.join(",");
      if (!active) return `<span class="cloze-inactive" data-ordinal="${ord}">${inner}</span>`;
      if (side === "answer") return `<span class="cloze" data-ordinal="${ord}">${inner}</span>`;
      const placeholder = node.hint ? `[${escapeHtml(stripHtml(node.hint))}]` : "[...]";
      const data = escapeHtml(plain(node.children));
      return `<span class="cloze" data-cloze="${data}" data-ordinal="${ord}">${placeholder}</span>`;
    })
    .join("");
}

/** All cloze numbers used in `text`. */
export function clozeOrdinals(text: string): number[] {
  const found = new Set<number>();
  const walk = (nodes: ClozeNode[]) =>
    nodes.forEach((n) => {
      if (typeof n !== "string") {
        n.ordinals.forEach((o) => found.add(o));
        walk(n.children);
      }
    });
  walk(parseCloze(text));
  return [...found].sort((a, b) => a - b);
}

/** Render the `cloze:` filter for cloze number `ordinal` (card ord + 1). */
export function renderCloze(text: string, ordinal: number, side: "question" | "answer"): string {
  return render(parseCloze(text), ordinal, side);
}

/** The text of the active cloze(s), used by `{{type:cloze:Field}}`. */
export function activeClozeText(text: string, ordinal: number): string {
  const out: string[] = [];
  const walk = (nodes: ClozeNode[]) =>
    nodes.forEach((n) => {
      if (typeof n === "string") return;
      if (n.ordinals.includes(ordinal)) out.push(stripHtml(plain(n.children)));
      else walk(n.children);
    });
  walk(parseCloze(text));
  return out.join(", ");
}

/** `cloze-only:` filter — only the active cloze contents. */
export function clozeOnly(text: string, ordinal: number): string {
  return activeClozeText(text, ordinal);
}

/** Cloze text with all deletions revealed, e.g. for search and list titles. */
export function clozeToPlain(text: string): string {
  return plain(parseCloze(text));
}
