import type { PartNote } from "../core/MultipartScore";
import type { MusicNote } from "../core/MusicScore";

/** Written quarter-note durations, MIDI pitches (a chord is one attack), rests and tied continuations.
 * Explicit tuplets use straight timing; grace notes are an authoring decision, not extra targets.
 */
export type KeyboardEvent = readonly [duration: number, pitch: number | readonly number[] | "rest" | "tie", timing?: "straight"];

/** Compile written keyboard bars to a shared performance timeline. Swing moves ordinary eighth
 * offbeats only; explicitly straight tuplets retain their positions. Ties extend the previous voice
 * across barlines and never introduce an attack. The caller supplies complete bars, including rests;
 * meter defaults to four quarter-note beats.
 */
export function performKeyboardPart(bars: readonly (readonly KeyboardEvent[])[], gain: number, swing = 2 / 3, measureBeats: 2 | 3 | 4 = 4): MusicNote[] {
  if (!(swing >= .5 && swing < 1)) throw new Error("Swing 比例必须在 1/2（含）至 1 之间。");
  if (!Number.isFinite(gain) || gain <= 0 || gain > 1) throw new Error("声部力度必须在 (0, 1] 范围内。");
  if (![2, 3, 4].includes(measureBeats)) throw new Error("每小节拍数需为 2、3 或 4。");
  const notes: MusicNote[] = [];
  const performed = (beat: number, straight: boolean) => {
    const whole = Math.floor(beat + 1e-9), fraction = beat - whole;
    return !straight && Math.abs(fraction - .5) < 1e-8 ? whole + swing : beat;
  };
  bars.forEach((bar, index) => {
    let offset = 0;
    for (const [duration, pitch, timing] of bar) {
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`第 ${index + 1} 小节时值无效。`);
      const start = performed(index * measureBeats + offset, timing === "straight");
      offset += duration;
      const end = performed(index * measureBeats + offset, timing === "straight");
      if (pitch === "rest") continue;
      if (pitch === "tie") {
        const previous = notes.at(-1);
        if (!previous || Math.abs(previous.beat + previous.duration - start) > 1e-8)
          throw new Error(`第 ${index + 1} 小节延音必须紧接上一音。`);
        previous.duration = end - previous.beat;
      } else {
        const [midi, ...additionalMidis] = typeof pitch === "number" ? [pitch] : pitch;
        if (midi === undefined || [midi, ...additionalMidis].some(n => !Number.isInteger(n) || n < 0 || n > 127))
          throw new Error(`第 ${index + 1} 小节音高无效。`);
        notes.push({ beat: start, duration: end - start, midi, gain,
          ...(additionalMidis.length ? { additionalMidis } : {}) });
      }
    }
    if (Math.abs(offset - measureBeats) > 1e-8) throw new Error(`第 ${index + 1} 小节需要 ${measureBeats} 拍，实际 ${offset}。`);
  });
  return notes;
}

/** Expand simultaneous pitches into independently addressable notes, preserving chord balance. */
export function partNotes(notes: readonly MusicNote[]): PartNote[] {
  return notes.flatMap((note, i) => [note.midi, ...(note.additionalMidis ?? [])].map((midi, j) => ({
    id: `${i}:${j}`, beat: note.beat, duration: note.duration, midi,
    velocity: note.gain / Math.sqrt(1 + (note.additionalMidis?.length ?? 0)),
  })));
}
