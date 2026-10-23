import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 2 }, () => ({
    elements: Array.from({ length: 16 }, () => ({ kind: "note", noteValue: "sixteenth" })),
  })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 64, 64, 65, 65, 67, 67, 67, 67, 65, 65, 64, 64, 62, 62],
  [60, 60, 60, 60, 62, 62, 64, 64, 62, 62, 60, 60, 60, 60, 60, 60],
];

export const sixteenth = {
  id: "sixteenth", title: "四平均", description: "一拍四下，均匀等分",
  // 首次 45° 保持顺时针；后续显式反转，让折线持续展开而不闭合。
  twirlTiles: Array.from({ length: 30 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
