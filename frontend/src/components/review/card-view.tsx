"use client";

import { type CSSProperties, useEffect, useRef } from "react";

import { useDarkMode } from "@/hooks/use-media-query";
import { useCardScale } from "@/lib/preferences/card-scale";

/**
 * Base styles inside the card's shadow root. Deck CSS is appended afterwards, so equally specific
 * deck rules win. `.card` gets a transparent background so it blends into Kuru's card canvas.
 * Deck CSS is usually sized for desktop Anki, so content is zoomed down on phones and by the
 * user's text size setting (`--kuru-user`). `zoom` (unlike `transform`) also shrinks the layout.
 */
const BASE_CSS = `
:host { display: block; color: var(--ios-label); --kuru-auto: 1; }
@media (max-width: 640px) { :host { --kuru-auto: 0.8; } }
.kuru-scale { zoom: calc(var(--kuru-auto) * var(--kuru-user, 1)); min-height: 100%; }
.card { font-size: 20px; line-height: 1.45; text-align: center; overflow-wrap: anywhere;
  background-color: transparent !important; padding: 24px 20px; min-height: 100%; box-sizing: border-box; }
@media (max-width: 640px) { .card { padding: 16px 14px; } }
.nightMode .card, .card.nightMode { color: #f2f2f7; }
img, video { max-width: 100%; height: auto; }
hr#answer, hr { border: none; height: 0.5px; background: var(--ios-separator); margin: 20px 0; }
.cloze { font-weight: 600; color: var(--ios-blue); }
.kuru-play { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
  margin: 0 4px; vertical-align: middle; border: 0; border-radius: 999px; cursor: pointer;
  color: var(--ios-blue); background: color-mix(in srgb, var(--ios-blue) 14%, transparent); }
.kuru-play:active { opacity: 0.6; }
.kuru-typeans, #typeans input { font: inherit; width: min(100%, 22em); margin-top: 12px; padding: 10px 14px;
  border-radius: 10px; border: 0; background: var(--ios-fill-3); color: inherit; text-align: center; outline: none; }
code#typeans { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.typeGood { background: color-mix(in srgb, var(--ios-green) 30%, transparent); }
.typeBad { background: color-mix(in srgb, var(--ios-red) 30%, transparent); }
.typeMissed { background: color-mix(in srgb, var(--ios-gray) 30%, transparent); }
details.hint summary { color: var(--ios-blue); cursor: pointer; }
.kuru-template-error { color: var(--ios-red); font-size: 15px; }
`;

/** Field values in the card info list: plain app styling, no deck CSS. */
const FIELD_CSS = `
:host { --kuru-auto: 1; }
.card { font-size: 17px; line-height: 1.4; text-align: left; padding: 0; min-height: 0; }
.kuru-play { width: 32px; height: 32px; }
hr { margin: 8px 0; }
`;

interface CardViewProps {
  html: string;
  css: string;
  onPlaySound?: (name: string) => void;
  onTypedAnswer?: (value: string) => void;
  onSubmitTypedAnswer?: () => void;
  /** "field" renders a single note field compactly, without deck CSS. */
  variant?: "card" | "field";
  className?: string;
}

/** Renders sanitised card HTML in a Shadow DOM, isolating deck CSS from the app (and vice versa). */
export function CardView({
  html,
  css,
  onPlaySound,
  onTypedAnswer,
  onSubmitTypedAnswer,
  variant = "card",
  className,
}: CardViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const dark = useDarkMode();
  const scale = useCardScale();
  const handlers = useRef({ onPlaySound, onTypedAnswer, onSubmitTypedAnswer });

  useEffect(() => {
    handlers.current = { onPlaySound, onTypedAnswer, onSubmitTypedAnswer };
  });

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    const night = dark ? "nightMode night_mode" : "";
    const styles = variant === "field" ? FIELD_CSS : css;
    root.innerHTML = `<style>${BASE_CSS}</style><style>${styles}</style><div class="kuru-scale ${night}"><div class="card ${night}">${html}</div></div>`;

    const onClick = (event: Event) => {
      const button = (event.target as Element | null)?.closest?.(".kuru-play");
      const sound = button?.getAttribute("data-sound");
      if (sound) handlers.current.onPlaySound?.(sound);
    };
    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.id === "typeans") handlers.current.onTypedAnswer?.(target.value);
    };
    const onKey = (event: Event) => {
      const key = event as KeyboardEvent;
      if ((key.target as HTMLElement).id === "typeans" && key.key === "Enter") {
        key.preventDefault();
        handlers.current.onSubmitTypedAnswer?.();
      }
      key.stopPropagation(); // typing must not trigger review shortcuts
    };
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKey);
    root.querySelector<HTMLInputElement>("#typeans")?.focus({ preventScroll: true });
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("keydown", onKey);
    };
  }, [html, css, dark, variant]);

  return <div ref={host} className={className} style={{ "--kuru-user": scale } as CSSProperties} />;
}
