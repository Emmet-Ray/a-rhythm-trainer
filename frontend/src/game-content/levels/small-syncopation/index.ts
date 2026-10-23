import { createPracticeMusic } from "../../shared/practiceMusic";
import type { RhythmExercise } from "../../../rhythm/RhythmModel";
import { rhythmPatterns } from "../../../rhythm/RhythmPatterns";

const pattern = rhythmPatterns.find(pattern => pattern.id === "small-syncopation")!;

const exercise = {
  timeSignature: { beats: 4, beatType: 4 },
  measures: Array.from({ length: 2 }, () => ({ elements: Array.from({ length: 4 }, () => pattern.events).flat() })),
} satisfies RhythmExercise;
const phrases = [
  [64, 64, 64, 65, 67, 67, 67, 65, 65, 64, 62, 62],
  [60, 60, 60, 62, 64, 64, 62, 60, 60, 60, 60, 60],
];

export const smallSyncopation = {
  id: "small-syncopation", title: pattern.label, description: "一拍三下：短、长、短",
  twirlTiles: Array.from({ length: 22 }, (_, i) => i + 2),
  category: "rhythm" as const,
  exercise, music: createPracticeMusic(exercise, phrases, "joy"),
};
