/**
 * HTML sanitisation for card content (DOMPurify). Scripts and event handlers are removed — deck
 * JavaScript is not executed (see roadmap) — and relative media paths are pointed at the API.
 */

import DOMPurify from "dompurify";

import { isRelativeUrl, mediaUrl } from "./media";

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const attr of ["src", "poster"] as const) {
      const value = node.getAttribute(attr);
      if (value && isRelativeUrl(value)) node.setAttribute(attr, mediaUrl(decodeURI(value)));
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export function sanitizeCardHtml(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["ruby", "rb", "rt", "rp", "details", "summary"],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta", "link"],
  });
}
