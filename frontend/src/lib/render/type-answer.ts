/** `{{type:Field}}` support: an input on the front, a character diff on the back. */

import { escapeHtml } from "./html";

export const TYPE_ANSWER_INPUT =
  '<input type="text" id="typeans" class="kuru-typeans" autocomplete="off" autocapitalize="off" spellcheck="false">';

/** Longest-common-subsequence diff, rendered with Anki's `typeGood/typeBad/typeMissed` classes. */
export function compareAnswer(expected: string, typed: string): string {
  const a = [...typed.trim()];
  const b = [...expected.trim()];
  if (a.join("") === b.join("")) {
    return `<code id="typeans"><span class="typeGood">${escapeHtml(b.join(""))}</span></code>`;
  }
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  let typedHtml = "";
  let expectedHtml = "";
  let i = 0;
  let j = 0;
  const span = (cls: string, ch: string) => `<span class="${cls}">${escapeHtml(ch)}</span>`;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      typedHtml += span("typeGood", a[i]!);
      expectedHtml += span("typeGood", b[j]!);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      typedHtml += span("typeMissed", "-");
      expectedHtml += span("typeMissed", b[j]!);
      j++;
    } else {
      typedHtml += span("typeBad", a[i]!);
      i++;
    }
  }
  if (!a.length) return `<code id="typeans">${expectedHtml}</code>`;
  return `<code id="typeans">${typedHtml}<br><span id="typearrow">&darr;</span><br>${expectedHtml}</code>`;
}
