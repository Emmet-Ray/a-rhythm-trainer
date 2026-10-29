import type { MusicScore } from "../core/MusicScore";
import type { OrbitTrack } from "../core/OrbitTrack";

/** Load the GS engine only when a round starts; list and idle pages load no bank/worklet. */
export async function prepareGameMusic(context: AudioContext, score: MusicScore, track: OrbitTrack, bpm: number, signal?: AbortSignal) {
  const { prepareSoundFontMusic } = await import("./SoundFontMusic");
  signal?.throwIfAborted();
  return prepareSoundFontMusic(context, score, track, bpm, signal);
}
export type GameMusic = Awaited<ReturnType<typeof prepareGameMusic>>;
