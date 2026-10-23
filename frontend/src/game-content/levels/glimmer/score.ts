import type { RhythmExercise } from "../../../rhythm/RhythmModel";
import { rhythmPatterns } from "../../../rhythm/RhythmPatterns";
import { createMusicMelody, type MusicScore } from "../../../game/core/MusicScore";

const q = [{ kind: "note", noteValue: "quarter" }] as const;
const e = rhythmPatterns.find(pattern => pattern.id === "two-eighths")!.events;
const s = rhythmPatterns.find(pattern => pattern.id === "four-sixteenths")!.events;
const beats = [
  [q,q,q,q], [q,q,q,q], [q,q,q,q], [q,q,q,q],
  [e,e,q,q], [q,e,e,q], [e,e,e,e], [e,e,q,q],
  [e,e,s,s], [e,s,e,s], [s,s,e,e], [e,e,e,e],
  [e,e,q,q], [q,e,e,q], [e,e,q,q], [q,q,q,q],
];
export const exercise: RhythmExercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: beats.map(beat => ({ elements: beat.flat() })),
};
// 四小节动机逐段变化，最后落回主音；Cmaj7 / Am7 / Fmaj7 / G 的循环。
const phrases = [
  [60,64,67,64], [64,60,57,60], [60,65,69,67], [62,67,71,67],
  [60,64,67,69,67,64], [64,67,64,60,62,64], [65,69,72,69,67,65,64,60], [62,67,69,67,62,59],
  [67,64,67,72,71,69,67,64,62,64,67,64],
  [64,60,64,67,69,67,64,60,59,60,62,64],
  [65,69,72,69,67,69,72,74,72,69,67,65],
  [67,71,74,72,71,69,67,62],
  [67,64,60,64,67,64], [64,60,57,60,62,64], [65,64,62,60,59,62], [67,64,62,60],
];
export const music: MusicScore = {
  title: "微光", recommendedBpm: 100,
  arrangements: [{ measure: 0, style: "spacious" }, { measure: 4, style: "rhythmic" }, { measure: 12, style: "spacious" }],
  chords: Array.from({ length: 16 }, (_, bar) => {
    if (bar === 15) return [48,55,60,64];
    return [[48,55,59,64], [45,52,55,60], [41,48,52,57], [43,50,55,59]][bar % 4];
  }),
  melody: createMusicMelody(exercise, phrases, (_beat, index) => index % 4 === 0 ? .48 : .40),
  sections: [{ measure: 0, title: "启程" }, { measure: 4, title: "展开" }, { measure: 8, title: "奔跑" }, { measure: 12, title: "归来" }],
};
