import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";

const eighth = { kind: "note", noteValue: "eighth" } as const;
const sixteenth = { kind: "note", noteValue: "sixteenth" } as const;

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: [
    { elements: [eighth, eighth, sixteenth, sixteenth, sixteenth, sixteenth,
      eighth, eighth, sixteenth, sixteenth, sixteenth, sixteenth] },
    { elements: [sixteenth, sixteenth, sixteenth, sixteenth, eighth, eighth,
      sixteenth, sixteenth, sixteenth, sixteenth, eighth, eighth] },
  ],
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 65, 65, 67, 67, 67, 65, 64, 64, 62, 62],
  [60, 60, 60, 60, 62, 64, 62, 62, 60, 60, 60, 60],
];

export const eighthSixteenth = {
  id: "eighth-sixteenth", title: "二平均与四平均混合", description: "两下与四下交替",
  // 首次转角延续顺时针，之后通过显式反转连接直角阶梯和斜向折线。
  twirlTiles: Array.from({ length: 22 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
