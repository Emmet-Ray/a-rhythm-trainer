import type { MusicInstrument } from "../audio/GameInstruments";
import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createExerciseTimeline } from "../../rhythm/RhythmTiming";

/** 音乐按四分拍编排；挑战命中触发旋律，试听按相同拍位提前排程。 */
export type ArrangementStyle = "spacious" | "rhythmic";
export type MusicNote = { beat: number; duration: number; midi: number; gain: number; additionalMidis?: readonly number[] };
export type MusicScore = {
  title: string;
  recommendedBpm: number;
  /** 显示曲谱来源；省略时为项目原创音乐。 */
  credit?: string;
  /** 按小节升序选择编配；省略时使用疏朗编配，主旋律统一为多音区钢琴。 */
  arrangements?: readonly { measure: number; style: ArrangementStyle }[];
  /** 各小节四分拍数；省略表示全曲 4/4。用于曲中变拍号，不改变训练题模型。 */
  measureBeats?: readonly (2 | 3 | 4)[];
  /** Optional performed length of the opening anacrusis; subsequent bars retain their meter. */
  pickupBeats?: number;
  /** 小节内换和弦，offset 为该小节内的四分拍位。小节首和弦仍由 chords 给出。 */
  chordChanges?: readonly { measure: number; offset: number; chord: readonly number[] }[];
  /** 每小节的低音及和声音高；自动编配时空数组表示 N.C.。提供 backing 时由显式音符决定声音。 */
  chords: readonly (readonly number[])[];
  melody: readonly MusicNote[];
  /** Explicit performed accompaniment replaces generated chord patterns; empty means intentional silence. */
  backing?: readonly (MusicNote & { instrument: MusicInstrument })[];
  sections: readonly { measure: number; title: string }[];
};

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

/** 返回含曲终边界的小节起点，播放、地图和范围选择共享这一时间基准。 */
export function musicMeasureStarts(score: Pick<MusicScore, "chords" | "measureBeats" | "chordChanges" | "pickupBeats">): number[] {
  if (!score.chords.length || (score.measureBeats && score.measureBeats.length !== score.chords.length))
    throw new Error("音乐小节拍数必须与和弦小节数一致。");
  if (score.pickupBeats !== undefined && (!Number.isFinite(score.pickupBeats) || score.pickupBeats <= 0 || score.pickupBeats >= (score.measureBeats?.[0] ?? 4)))
    throw new Error("弱起时长必须大于零且短于一个完整小节。");
  const starts = [0];
  for (let bar = 0; bar < score.chords.length; bar++) {
    const beats = score.measureBeats?.[bar] ?? 4;
    if (![2, 3, 4].includes(beats)) throw new Error(`第 ${bar + 1} 小节拍数需为 2、3 或 4。`);
    starts.push(starts.at(-1)! + (bar === 0 ? score.pickupBeats ?? beats : beats));
  }
  const seen = new Set<string>();
  for (const change of score.chordChanges ?? []) {
    const key = `${change.measure}:${change.offset}`;
    if (!Number.isInteger(change.measure) || change.measure < 0 || change.measure >= score.chords.length
      || !Number.isFinite(change.offset) || change.offset <= 0
      || change.offset >= starts[change.measure + 1] - starts[change.measure] || seen.has(key))
      throw new Error("换和弦需要唯一、有效的小节内拍位。");
    seen.add(key);
  }
  for (const chord of [...score.chords, ...(score.chordChanges ?? []).map(change => change.chord)]) {
    if (chord.some(midi => !Number.isInteger(midi) || midi < 0 || midi > 127))
      throw new Error("和弦需要有效的 MIDI 音高。");
  }
  return starts;
}
