import type { OrbitTrack } from "./OrbitTrack";
export type OrbitPhase = "ready" | "loading" | "count-in" | "playing" | "failed" | "completed";
export const ORBIT_EARLY_TAP_LIMIT = 3;
export type OrbitSnapshot = Readonly<{
  phase: OrbitPhase;
  hits: number;
  countIn: number;
  /** 当前待命中目标前的提前误敲次数，成功命中后清零。 */
  earlyTaps: number;
  feedback: "" | "准确" | "偏早" | "偏晚" | "过早";
  failure?: "early" | "late" | "extra";
}>;
export const READY_ORBIT: OrbitSnapshot = { phase: "ready", hits: 0, countIn: 0, earlyTaps: 0, feedback: "" };

/** 关卡目标以四分拍为单位，预备拍为负时间。
 * 输入时间由音频时钟提供；每个目标前三次提前误敲不消耗目标，第四次结束。
 * 命中后重新计数；超时漏拍仍立即结束，终态不再接受输入。
 * tap 仅在有效命中时返回 true，提前误敲不能触发旋律或换圆心。
 * 窗口为左闭右开，完美区间包含边界，与现有击拍判定保持一致。
 * 命中窗口不越过相邻目标的中点，避免密集输入将上一拍的多敲算成下一拍。
 */
export class OrbitRound {
  readonly beatMs: number;
  readonly track: OrbitTrack;
  private readonly windows: { hitMs: number; perfectMs: number };
  snapshot: OrbitSnapshot = { ...READY_ORBIT, phase: "count-in" };
  stoppedAtMs: number | null = null;

  constructor(bpm: number, windows: { hitMs: number; perfectMs: number }, track: OrbitTrack) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error("游戏速度需要在 40–240 BPM 之间。");
    this.beatMs = 60000 / bpm;
    this.track = track;
    this.windows = { ...windows };
  }

  private fail(reason: "early" | "late" | "extra", at: number) {
    this.stoppedAtMs = at;
    this.snapshot = { ...this.snapshot, phase: "failed", failure: reason, feedback: "" };
  }

  private targetWindow() {
    const index = this.snapshot.hits;
    const target = this.track.targets[index] * this.beatMs;
    const previous = this.track.targets[index - 1];
    const next = this.track.targets[index + 1];
    return {
      opensAt: Math.max(target - this.windows.hitMs, previous === undefined ? -Infinity : (previous * this.beatMs + target) / 2),
      closesAt: Math.min(target + this.windows.hitMs, next === undefined ? Infinity : (next * this.beatMs + target) / 2),
    };
  }

  advance(timeMs: number) {
    if (this.snapshot.phase === "failed" || this.snapshot.phase === "completed") return;
    if (timeMs < 0) {
      const countIn = Math.max(0, Math.min(4, Math.floor(timeMs / this.beatMs) + 5));
      if (countIn !== this.snapshot.countIn) this.snapshot = { ...this.snapshot, countIn };
      return;
    }
    if (this.snapshot.phase === "count-in") this.snapshot = { ...this.snapshot, phase: "playing", countIn: 0 };
    if (!this.track.targets.length) {
      if (timeMs >= this.track.durationBeats * this.beatMs) {
        this.snapshot = { ...this.snapshot, phase: "completed" };
        this.stoppedAtMs = timeMs;
      }
      return;
    }
    const deadline = this.targetWindow().closesAt;
    if (timeMs >= deadline) this.fail("late", deadline);
  }

  tap(timeMs: number) {
    if (!Number.isFinite(timeMs) || timeMs < 0 || this.snapshot.phase === "failed" || this.snapshot.phase === "completed") return false;
    if (!this.track.targets.length) return false;
    this.advance(timeMs);
    if (this.stoppedAtMs !== null) return false;
    const delta = timeMs - this.track.targets[this.snapshot.hits] * this.beatMs;
    if (timeMs < this.targetWindow().opensAt) {
      const earlyTaps = this.snapshot.earlyTaps + 1;
      this.snapshot = { ...this.snapshot, earlyTaps, feedback: "过早" };
      if (earlyTaps > ORBIT_EARLY_TAP_LIMIT) this.fail(this.snapshot.hits > 0 ? "extra" : "early", timeMs);
      return false;
    }
    const hits = this.snapshot.hits + 1;
    const feedback = Math.abs(delta) <= this.windows.perfectMs ? "准确" : delta < 0 ? "偏早" : "偏晚";
    this.snapshot = { phase: hits === this.track.targets.length ? "completed" : "playing", hits, countIn: 0, earlyTaps: 0, feedback };
    if (hits === this.track.targets.length) this.stoppedAtMs = Math.max(timeMs, this.track.targets[this.track.targets.length - 1] * this.beatMs);
    return true;
  }
}
