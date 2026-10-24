import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";
import { rhythmPatterns } from "../../../rhythm/RhythmPatterns";

const pattern = rhythmPatterns.find(pattern => pattern.id === "dotted-eighth-sixteenth")!;

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 2 }, () => ({ elements: Array.from({ length: 4 }, () => pattern.events).flat() })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 65, 67, 67, 65, 64, 62],
  [60, 60, 62, 64, 62, 60, 60, 60],
];

export const dottedEighth = {
  id: "dotted-eighth", title: pattern.label, description: "一拍两下：长短 3:1",
  // 显式反转连接 135° 与 45° 间隔，保持落点间距和不交叉的道路。
  twirlTiles: [1, 2, 4, 6, 8, 10, 12, 14, 15],
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
