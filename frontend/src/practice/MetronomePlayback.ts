import { createContext } from "react";

/** 一轮播放的只读视图。正式起点为 0，预备拍为负；读取不得改变判定采样状态。 */
export type MetronomePlayback = {
  readTimeMs: () => number;
  bpm: number;
  countInDurationMs: number;
  durationMs: number;
};

/** 设置区内的播放连接：仅在开始/清理时通知，逐帧时间由显示组件自行读取。
 * start 返回本次播放的清理函数；旧播放的清理不能覆盖后来注册的新播放。
 */
export function createMetronomePlayback() {
  let current: MetronomePlayback | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(playback: MetronomePlayback) {
      const owned = { ...playback };
      current = owned;
      notify();
      return () => {
        if (current !== owned) return;
        current = null;
        notify();
      };
    },
  };
}

export const MetronomePlaybackContext = createContext<ReturnType<typeof createMetronomePlayback> | null>(null);

/** 第一声在左端，此后每拍到达另一端；掉帧或重新开启时直接恢复当前相位。
 * 调度余量期间和音乐结束后归中，不把额外的判定等待时间画成节拍。
 */
export function getMetronomeAngle(timeMs: number, playback: Pick<MetronomePlayback, "bpm" | "countInDurationMs" | "durationMs">): number {
  if (!Number.isFinite(timeMs) || timeMs < -playback.countInDurationMs || timeMs >= playback.durationMs) return 0;
  const beats = (timeMs + playback.countInDurationMs) / (60000 / playback.bpm);
  return -25 * Math.cos(Math.PI * beats);
}
