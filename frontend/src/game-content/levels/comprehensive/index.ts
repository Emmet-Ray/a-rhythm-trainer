import { createPracticeMusic } from "../../shared/practiceMusic";
import type { EighthTriplet, RhythmElement, RhythmExercise } from "../../../rhythm/RhythmModel";
import { rhythmPatterns } from "../../../rhythm/RhythmPatterns";

const quarter = [{ kind: "note", noteValue: "quarter" }] as const;
const eighth = { kind: "note", noteValue: "eighth" } as const;
const triplet: readonly EighthTriplet[] = [{ kind: "triplet", notes: [eighth, eighth, eighth] }];
const pattern = (id: typeof rhythmPatterns[number]["id"]) => rhythmPatterns.find(pattern => pattern.id === id)!.events;
const two = pattern("two-eighths"), four = pattern("four-sixteenths");
const front = pattern("eighth-two-sixteenths"), back = pattern("two-sixteenths-eighth");
const dotted = pattern("dotted-eighth-sixteenth"), reverse = pattern("sixteenth-dotted-eighth");
const syncopation = pattern("small-syncopation");

// 每行四拍：先重复建立规律，再切换；最后回到四分音符收尾。
const measures: (readonly RhythmElement[])[][] = [
  [quarter, quarter, two, two],
  [two, two, four, four],
  [front, front, back, back],
  [front, back, front, back],
  [dotted, dotted, reverse, reverse],
  [syncopation, syncopation, dotted, reverse],
  [two, triplet, two, triplet],
  [triplet, two, quarter, quarter],
];

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: measures.map(beats => ({ elements: beats.flat() })),
} satisfies RhythmExercise;
const phrases = [
  [60, 60, 67, 67, 67, 67],
  [69, 69, 69, 69, 67, 67, 67, 67, 67, 67, 67, 67],
  [65, 65, 65, 65, 65, 65, 64, 64, 64, 64, 64, 64],
  [62, 62, 62, 62, 62, 62, 60, 60, 60, 60, 60, 60],
  [67, 67, 67, 67, 65, 65, 65, 65],
  [64, 64, 64, 64, 64, 64, 62, 62, 62, 62],
  [65, 65, 65, 65, 65, 64, 64, 64, 64, 64],
  [62, 62, 62, 62, 62, 60, 60],
];

export const comprehensive = {
  id: "comprehensive", title: "综合挑战", description: "细分、附点、切分与三连音串联",
  // 转向是固定的关卡事件；让长路线持续展开，避免交叉及靠得过近的落点。
  twirlTiles: [4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39,
    40, 41, 42, 44, 45, 47, 49, 51, 52, 53, 54, 55, 56, 57, 59, 61, 63, 64,
    65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75],
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "twinkle"),
};
