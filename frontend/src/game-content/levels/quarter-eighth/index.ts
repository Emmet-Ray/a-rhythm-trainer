import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";

const quarter = { kind: "note", noteValue: "quarter" } as const;
const eighth = { kind: "note", noteValue: "eighth" } as const;

/** 先建立基本拍，再加密，最后在每拍一次与两次之间切换。 */
const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: [
    { elements: [quarter, quarter, quarter, quarter] },
    { elements: [eighth, eighth, eighth, eighth, eighth, eighth, eighth, eighth] },
    { elements: [quarter, eighth, eighth, quarter, eighth, eighth] },
    { elements: [eighth, eighth, quarter, eighth, eighth, quarter] },
  ],
} satisfies RhythmExercise;
const phrases = [
  [60, 60, 67, 67],
  [69, 69, 69, 69, 67, 67, 67, 67],
  [65, 65, 65, 64, 64, 64],
  [62, 62, 62, 60, 60, 60],
];

export const quarterEighth = {
  id: "quarter-eighth", title: "四分与二平均混合", description: "一下与两下交替",
  twirlTiles: [6, 7, 8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 20, 22, 23],
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "twinkle"),
};
