import type { OrbitPhase, OrbitSnapshot } from "../core/OrbitRound";

export const ORBIT_FAILURE_REVEAL_MS = 360;
export const ORBIT_LANDING_MS = 600;
export type OrbitDisplaySnapshot = Omit<OrbitSnapshot, "phase"> & {
  phase: OrbitPhase | "finishing" | "failing";
};

/** 判定终态立即锁定输入，结果展示另等音频时钟和真实声部结束。
 * 失败先留一小段位置反馈；成功至少保留末音时值和落地动画。
 * landedAtMs 是实际末次落地时间（提前命中也不能早于目标），试听用原定末拍。
 * 同一阶段返回稳定快照；每轮新建，停止时废弃，不创建计时器或改变判定。
 */
export class OrbitEnding {
  atMs = -Infinity;
  private source: OrbitSnapshot | null = null;
  private pending: OrbitDisplaySnapshot | null = null;
  private revealed = false;
  private readonly durationMs: number;
  constructor(durationMs: number) { this.durationMs = durationMs; }

  read(snapshot: OrbitSnapshot, nowMs: number, audioFinished: boolean, landedAtMs: number): OrbitDisplaySnapshot {
    if (snapshot.phase !== "failed" && snapshot.phase !== "completed") return snapshot;
    if (snapshot !== this.source) {
      this.source = snapshot;
      this.atMs = snapshot.phase === "failed" ? nowMs : landedAtMs;
      this.pending = { ...snapshot, phase: snapshot.phase === "failed" ? "failing" : "finishing" };
      this.revealed = false;
    }
    this.revealed ||= snapshot.phase === "failed"
      ? nowMs >= this.atMs + ORBIT_FAILURE_REVEAL_MS
      : audioFinished && nowMs >= this.durationMs && nowMs >= this.atMs + ORBIT_LANDING_MS;
    return this.revealed ? snapshot : this.pending!;
  }
}
