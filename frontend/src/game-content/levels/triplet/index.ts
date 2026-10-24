import { createPracticeMusic } from "../../shared/practiceMusic";
import type { EighthTriplet, RhythmExercise } from "../../../rhythm/RhythmModel";

const beat: EighthTriplet = {
  kind: "triplet",
  notes: [
    { kind: "note", noteValue: "eighth" },
    { kind: "note", noteValue: "eighth" },
    { kind: "note", noteValue: "eighth" },
  ],
};

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 2 }, () => ({ elements: Array.from({ length: 4 }, () => beat) })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 64, 65, 65, 67, 67, 67, 65, 64, 64, 62],
  [60, 60, 60, 62, 62, 64, 62, 62, 60, 60, 60, 60],
];

export const triplet = {
  id: "triplet", title: "三连音", description: "一拍三下，三等分",
  // 首次 60° 保持顺时针，后续通过显式反转让折线持续展开。
  twirlTiles: Array.from({ length: 22 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
