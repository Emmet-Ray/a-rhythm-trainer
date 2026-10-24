import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";
const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 4 }, () => ({ elements: Array.from({ length: 8 }, () => ({ kind: "note", noteValue: "eighth" })) })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 65, 67, 67, 65, 64, 62],
  [60, 60, 62, 64, 62, 60, 60, 60],
  [64, 64, 65, 67, 67, 65, 64, 62],
  [60, 60, 62, 64, 62, 60, 60, 60],
];

export const eighth = {
  id: "eighth", title: "二平均", description: "一拍两下，均匀等分",
  // 首个拐角延续顺时针，之后每次反转使阶梯持续展开。
  twirlTiles: Array.from({ length: 30 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
