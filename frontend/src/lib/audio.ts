/**
 * HTML5 audio wrapper with pre-buffering, so card audio starts without delay.
 *
 * Elements are created ahead of time (`preload`) for the upcoming cards; `playSequence` plays a
 * card's sounds one after another, like Anki does.
 */

import { mediaUrl } from "@/lib/render/media";

const MAX_CACHED = 32;

export class AudioPlayer {
  private readonly cache = new Map<string, HTMLAudioElement>();
  private current: HTMLAudioElement | null = null;
  private sequence = 0;

  private element(name: string): HTMLAudioElement {
    return this.cache.get(name) ?? this.create(name);
  }

  private create(name: string): HTMLAudioElement {
    const audio = new Audio(mediaUrl(name));
    audio.preload = "auto";
    this.cache.set(name, audio);
    while (this.cache.size > MAX_CACHED) {
      const oldest = this.cache.keys().next().value as string;
      if (this.cache.get(oldest) === this.current) break;
      this.cache.delete(oldest);
    }
    return audio;
  }

  /**
   * Start downloading sounds that will be needed soon. Elements that already exist are left alone:
   * `load()` resets an element and would cut off a sound that is playing right now (sibling cards
   * often share their audio).
   */
  preload(names: readonly string[]): void {
    for (const name of names) if (!this.cache.has(name)) this.create(name).load();
  }

  /** Play sounds in order; a new call cancels the previous sequence. */
  async playSequence(names: readonly string[]): Promise<void> {
    this.stop();
    const id = ++this.sequence;
    for (const name of names) {
      if (id !== this.sequence) return;
      const audio = this.element(name);
      this.current = audio;
      audio.currentTime = 0;
      try {
        await audio.play();
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          audio.addEventListener("ended", done, { once: true });
          audio.addEventListener("pause", done, { once: true });
          audio.addEventListener("error", done, { once: true });
        });
      } catch {
        // Autoplay can be blocked until the first user gesture; ignore and continue.
      }
    }
  }

  play(name: string): Promise<void> {
    return this.playSequence([name]);
  }

  stop(): void {
    this.sequence++;
    if (this.current && !this.current.paused) this.current.pause();
    this.current = null;
  }
}
