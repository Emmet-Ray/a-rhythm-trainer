import { READY_ORBIT, type OrbitSnapshot } from "./OrbitRound";
import type { OrbitTrack } from "./OrbitTrack";

/** 自动演奏只从音频时间读取进度，不模拟用户输入，也不使用挑战的命中窗口。
 * 掉帧时直接定位当前落点；声音已独立排程，advance 不发声或补响。
 * 播完所选范围的完整时值才结束，保留最后一个音符的时长。
 */
export class OrbitPreview {
  readonly beatMs: number;
  private readonly track: OrbitTrack;
  snapshot: OrbitSnapshot = { ...READY_ORBIT, phase: "count-in" };
  stoppedAtMs: number | null = null;

  constructor(bpm: number, track: OrbitTrack) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error("游戏速度需要在 40–240 BPM 之间。");
    this.beatMs = 60000 / bpm;
    this.track = track;
  }

  advance(timeMs: number) {
    if (!Number.isFinite(timeMs) || this.snapshot.phase === "completed") return;
    const beat = timeMs / this.beatMs;
    let hits = this.snapshot.hits;
    while (hits < this.track.targets.length && timeMs >= this.track.targets[hits] * this.beatMs) hits++;
    const phase = timeMs < 0 ? "count-in" : timeMs < this.track.durationBeats * this.beatMs ? "playing" : "completed";
    const countIn = beat < 0 ? Math.max(0, Math.min(4, Math.floor(beat) + 5)) : 0;
    if (phase === "completed") this.stoppedAtMs = this.track.durationBeats * this.beatMs;
    if (phase !== this.snapshot.phase || hits !== this.snapshot.hits || countIn !== this.snapshot.countIn) {
      this.snapshot = { ...READY_ORBIT, phase, hits, countIn };
    }
  }
}
