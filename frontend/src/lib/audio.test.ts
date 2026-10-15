import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "./audio";

describe("AudioPlayer.preload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not reload a sound that is already playing", async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const player = new AudioPlayer();

    // Sibling cards share their audio: the next card is preloaded while this one plays it.
    player.preload(["fu.mp3"]);
    void player.play("fu.mp3");
    player.preload(["fu.mp3", "ka.mp3"]);

    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.contexts.map((el) => (el as HTMLAudioElement).src)).toEqual([
      expect.stringContaining("fu.mp3"),
      expect.stringContaining("ka.mp3"),
    ]);
  });
});
