import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createMusicMelody, type MusicScore } from "../../game/core/MusicScore";

// Familiar themes rephrased to the exact exercise rhythm. Each level owns its pitches;
// repeated notes divide sustained tones instead of filling space with unrelated runs.
const C = [36, 48, 55], F = [41, 48, 53], G = [43, 50, 55];
const themes = {
  twinkle: { title: "小星星 · 节奏变奏", credit: "法国传统旋律《Ah ! vous dirai-je, maman》· 节奏改编" },
  joy: { title: "欢乐颂 · 节奏变奏", credit: "贝多芬《欢乐颂》主题 · 节奏与收束改编" },
};

export function createPracticeMusic(exercise: RhythmExercise, phrases: readonly (readonly number[])[], theme: keyof typeof themes): MusicScore {
  const bars = exercise.measures.length;
  if (![2, 4, 8].includes(bars) || exercise.timeSignature.beats !== 4 || exercise.timeSignature.beatType !== 4)
    throw new Error("排练室编配需要 2、4 或 8 个完整 4/4 小节。");
  // Open fifths leave space for the theme; the final two beats settle on the tonic.
  const harmony = theme === "joy"
    ? Array.from({ length: bars / 2 }, () => [C, G, C, C]).flat()
    : bars === 8 ? [C,C,F,C,F,C,G,C,C,F,C,G,F,C,G,C] : [C,C,F,C,F,C,G,C];
  const chords = Array.from({ length: bars }, (_, bar) => harmony[bar * 2]);
  return {
    ...themes[theme], recommendedBpm: 60, chords, sections: [],
    chordChanges: chords.map((_, bar) => ({ measure: bar, offset: 2, chord: harmony[bar * 2 + 1] })),
    melody: createMusicMelody(exercise, phrases, beat => Number.isInteger(beat) ? .42 : .38),
    // Two gentle harmonic arrivals per bar, no drums or competing offbeat accents.
    backing: harmony.flatMap((chord, halfBar) => [
      { instrument: "bass" as const, beat: halfBar * 2, duration: 1.85, midi: chord[0], gain: .09 },
      { instrument: "ep" as const, beat: halfBar * 2, duration: 1.85, midi: chord[1], additionalMidis: chord.slice(2), gain: .12 },
    ]),
  };
}
