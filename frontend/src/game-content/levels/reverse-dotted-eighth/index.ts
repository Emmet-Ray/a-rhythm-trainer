import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";
import { rhythmPatterns } from "../../../rhythm/RhythmPatterns";

const pattern = rhythmPatterns.find(pattern => pattern.id === "sixteenth-dotted-eighth")!;

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 2 }, () => ({ elements: Array.from({ length: 4 }, () => pattern.events).flat() })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 65, 67, 67, 65, 64, 62],
  [60, 60, 62, 64, 62, 60, 60, 60],
];

export const reverseDottedEighth = {
  id: "reverse-dotted-eighth", title: pattern.label, description: "一拍两下：短长 1:3",
  twirlTiles: [2, 4, 6, 8, 10, 12, 14],
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
