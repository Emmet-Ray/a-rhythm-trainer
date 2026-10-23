import { createPracticeMusic } from "../../shared/practiceMusic";
import type { EighthTriplet, RhythmExercise } from "../../../rhythm/RhythmModel";

const eighth = { kind: "note", noteValue: "eighth" } as const;
const triplet: EighthTriplet = {
  kind: "triplet",
  notes: [eighth, eighth, eighth],
};

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: [
    { elements: [eighth, eighth, triplet, eighth, eighth, triplet] },
    { elements: [triplet, eighth, eighth, triplet, eighth, eighth] },
  ],
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 65, 65, 67, 67, 65, 64, 64, 62],
  [60, 60, 60, 62, 64, 62, 62, 60, 60, 60],
];

export const eighthTriplet = {
  id: "eighth-triplet", title: "二平均与三连音混合", description: "二等分与三等分交替",
  // 首次直角保持顺时针，后续显式反转连接 90° 与 60° 折线。
  twirlTiles: Array.from({ length: 18 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
