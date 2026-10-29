import type { MultipartScore } from "./MultipartScore";
import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createExerciseTimeline } from "../../rhythm/RhythmTiming";

export type MusicScore = MultipartScore;
/** Compact keyboard authoring event; expanded to independent PartNotes before playback. */
export type MusicNote = { beat: number; duration: number; midi: number; gain: number; additionalMidis?: readonly number[] };

/** 每小节填写一组 MIDI 音高，与该小节的敲击目标逐一对应。
 * 时间和时长由节奏模型推导；音量函数按全曲拍位、全曲音符下标决定力度。
 * 在编曲时检查缺音/多音，避免一小节的错误把后续旋律整体错位。
 */
export function createMusicMelody(
  exercise: RhythmExercise,
  phrases: readonly (readonly number[])[],
  gainAt: (beat: number, index: number) => number,
): MusicNote[] {
  const timeline = createExerciseTimeline(exercise, 60, 4, { hitMs: 1, perfectMs: 0 });
  if (phrases.length !== exercise.measures.length) throw new Error("旋律需要为每个小节提供一组音高。");
  return timeline.measures.flatMap((measure, bar) => {
    const targets = timeline.targetTaps.filter(tap => tap.offsetMs >= measure.startOffsetMs && tap.offsetMs < measure.endOffsetMs);
    if (phrases[bar].length !== targets.length) throw new Error(`第 ${bar + 1} 小节需要 ${targets.length} 个旋律音，实际为 ${phrases[bar].length} 个。`);
    return targets.map((tap, localIndex) => {
      const index = timeline.targetTaps.indexOf(tap), beat = tap.offsetMs / 1000;
      const midi = phrases[bar][localIndex], gain = gainAt(beat, index);
      if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !Number.isFinite(gain) || gain <= 0 || gain > 1) {
        throw new Error(`第 ${bar + 1} 小节第 ${localIndex + 1} 个旋律音需要有效的 MIDI 音高和 (0, 1] 音量。`);
      }
      return { beat, midi, gain, duration: (timeline.eventEndOffsetsMs[tap.eventIndex] - tap.offsetMs) / 1000 };
    });
  });
}
