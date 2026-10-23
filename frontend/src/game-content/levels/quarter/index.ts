import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";
const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 4 }, () => ({ elements: Array.from({ length: 4 }, () => ({ kind: "note", noteValue: "quarter" })) })),
} satisfies RhythmExercise;
const phrases = [
  [60, 60, 67, 67],
  [69, 69, 67, 67],
  [65, 65, 64, 64],
  [62, 62, 60, 60],
];

export const quarter = {
  id: "quarter", title: "均匀四分", description: "一拍一下，稳住基本拍",
  twirlTiles: [],
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "twinkle"),
};
