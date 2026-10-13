/** Small HTML helpers usable without a DOM. */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Strip tags (keeping text) like Anki's `text:` filter. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

/** Anki's definition of an empty field: only whitespace, `<br>` and `<div>` tags. */
export function isFieldEmpty(html: string): boolean {
  return /^(?:[\s ]|&nbsp;|<\/?(?:br|div)\s?\/?>)*$/i.test(html);
}
