export { createTargetTapTimeline };

import {
  noteValueToDurationInQuarterNotes,
  type RhythmExercise,
} from "./RhythmModel";

type TargetTap = {
  eventIndex: number;
  offsetMs: number;
};

function createTargetTapTimeline(
  exercise: RhythmExercise,
  bpm: number,
): TargetTap[] {
  //
  const TIME_PER_BEAT = 60_000 / bpm;
  let currentTime = 0;
  const targetTap: TargetTap[] = [];
  exercise.events.forEach((e, index) => {
    if (e.kind === "note") {
      targetTap.push({ eventIndex: index, offsetMs: currentTime });
    }

    currentTime +=
      TIME_PER_BEAT * noteValueToDurationInQuarterNotes(e.noteValue);
  });
  return targetTap;
}
