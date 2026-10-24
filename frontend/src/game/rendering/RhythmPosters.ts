import { expandRhythmElements, TICKS_PER_QUARTER, type RhythmElement, type RhythmExercise } from "../../rhythm/RhythmModel";

export type RhythmPoster = { x: number; y: number; width: number; height: number; elements?: readonly RhythmElement[] };

/** Extract complete beats without splitting notes or triplets. For the current studies
 * every figure fits a beat; a future cross-beat figure falls back to its intact measure. */
export function exercisePosterExamples(exercise: RhythmExercise): readonly (readonly RhythmElement[])[] {
  const figures = new Map<string, readonly RhythmElement[]>();
  const measureKeys: Set<string>[] = [];
  for (const measure of exercise.measures) {
    let beat: RhythmElement[] = [], ticks = 0;
    const keys = new Set<string>();
    for (const element of measure.elements) {
      beat.push(element); ticks += expandRhythmElements([element]).durationTicks;
      if (ticks === TICKS_PER_QUARTER) {
        const key = JSON.stringify(beat); keys.add(key); figures.set(key, beat);
        beat = []; ticks = 0;
      } else if (ticks > TICKS_PER_QUARTER) return exercise.measures.slice(0, 2).map(bar => bar.elements);
    }
    measureKeys.push(keys);
  }
  const patterns = [...figures.values()];
  if (!patterns.length) return [];
  if (patterns.length === 1) return [patterns[0], [...patterns[0], ...patterns[0]]];
  if (patterns.length === 2) return patterns;
  // Keep complete bars legible on the native pixel grid, then maximize coverage.
  const candidates = measureKeys.map((_, index) => index).filter(index => expandRhythmElements(exercise.measures[index].elements).events.length <= 8);
  if (candidates.length < 2) return patterns.slice(0, 2);
  const first = candidates.reduce((best, index) => measureKeys[index].size > measureKeys[best].size ? index : best);
  const novelty = (index: number) => [...measureKeys[index]].filter(key => !measureKeys[first].has(key)).length;
  const second = candidates.filter(index => index !== first).reduce((best, index) => novelty(index) > novelty(best) ? index : best);
  return [first, second].sort((a,b) => a-b).map(index => exercise.measures[index].elements);
}

/** Tiny pixel notation for scenery, not a general score engraver. Uses the rhythm
 * model's exact durations; full-size notation elsewhere remains owned by VexFlow. */
export function drawRhythmPosters(context: CanvasRenderingContext2D, posters: readonly RhythmPoster[], { largeNoteheads = false } = {}) {
  for (const poster of posters) {
    if (!poster.elements?.length) continue;
    const { events, tripletGroups, durationTicks } = expandRhythmElements(poster.elements);
    context.save();
    context.beginPath(); context.rect(poster.x, poster.y, poster.width, poster.height); context.clip();
    context.fillStyle = "#2f3438";
    const rect = (x: number, y: number, w: number, h: number) => context.fillRect(Math.round(x), Math.round(y), w, h);
    const baseline = poster.y + poster.height - 6;
    const available = poster.width - 10;
    const span = Math.min(available, Math.max(12, events.length * 9));
    const left = poster.x + (poster.width - span) / 2;
    // Card notation uses even engraving spacing so enlarged heads never touch;
    // duration is carried by beams/dots, not by a proportional timing strip.
    const positions = events.map((event, index) => Math.round(largeNoteheads
      ? poster.x + (poster.width - (events.length - 1) * 7 - 4) / 2 + index * 7
      : left + event.startTick / durationTicks * span));
    if (!largeNoteheads && durationTicks === 4 * TICKS_PER_QUARTER) {
      // Center visible notation, excluding the silent space after the last onset.
      const right = Math.max(...events.map(({ event }, index) => positions[index] + (event.dots ? (largeNoteheads ? 6 : 5) : (largeNoteheads ? 4 : 3))));
      const offset = Math.round(poster.x + poster.width / 2 - (positions[0] + right) / 2);
      positions.forEach((x, index) => { positions[index] = x + offset; });
    }
    const beamY = baseline - 10;
    const stemX = largeNoteheads ? 3 : 2;
    rect(left - 3, baseline, span + 7, 1);
    if (durationTicks === 4 * TICKS_PER_QUARTER) { rect(left - 3, baseline - 4, 1, 9); rect(left + span + 3, baseline - 4, 1, 9); }
    const triplets = new Set(tripletGroups.flat());
    const depth = (index: number) => events[index].event.noteValue === "sixteenth" ? 2 : events[index].event.noteValue === "eighth" ? 1 : 0;
    events.forEach(({ event }, index) => {
      const x = positions[index];
      if (event.kind === "rest") { rect(x, baseline - 4, 3, 2); return; }
      rect(x, baseline - (largeNoteheads ? 2 : 1), stemX + 1, largeNoteheads ? 3 : 2); rect(x + stemX, beamY, 1, 10);
      if (event.dots) rect(x + stemX + 2, baseline - 2, 1, 1);
    });
    // Beam only within each basic beat (triplet groups are also exactly one beat).
    events.forEach(({ startTick }, index) => {
      if (!depth(index)) return;
      const x = positions[index] + stemX, next = index + 1;
      const sameBeat = next < events.length && Math.floor(startTick / TICKS_PER_QUARTER) === Math.floor(events[next].startTick / TICKS_PER_QUARTER);
      const joined = sameBeat && depth(next) > 0 && triplets.has(index) === triplets.has(next);
      if (joined) rect(x, beamY, positions[next] + stemX + 1 - x, 2);
      else if (index === 0 || !depth(index - 1) || Math.floor(events[index - 1].startTick / TICKS_PER_QUARTER) !== Math.floor(startTick / TICKS_PER_QUARTER)) rect(x, beamY, 3, 2);
      if (depth(index) === 2) {
        if (joined && depth(next) === 2) rect(x, beamY + 3, positions[next] + stemX + 1 - x, 1);
        else {
          const previous = index > 0 && depth(index - 1) === 2 && Math.floor(events[index - 1].startTick / TICKS_PER_QUARTER) === Math.floor(startTick / TICKS_PER_QUARTER);
          if (!previous) rect(x + (joined ? 0 : -2), beamY + 3, 3, 1);
        }
      }
    });
    for (const group of tripletGroups) {
      const x = Math.round((positions[group[0]] + positions[group[2]]) / 2), y = beamY - 7;
      rect(x, y, 3, 1); rect(x + 2, y, 1, 5); rect(x, y + 2, 3, 1); rect(x, y + 4, 3, 1);
    }
    context.restore();
  }
}
