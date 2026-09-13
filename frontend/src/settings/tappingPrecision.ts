import type { TimingWindows } from "../rhythm/RhythmTiming";

/** 档位是练习产品参数，不是行业标准；所有击拍来源共用，不按 BPM 缩放。 */
export const tappingPrecisions = [
  { id: "relaxed", label: "宽松", windows: { perfectMs: 80, hitMs: 200 } },
  { id: "standard", label: "标准", windows: { perfectMs: 50, hitMs: 150 } },
  { id: "strict", label: "严格", windows: { perfectMs: 30, hitMs: 100 } },
] as const;
export type TappingPrecision = typeof tappingPrecisions[number]["id"];
export const DEFAULT_TAPPING_PRECISION: TappingPrecision = "standard";
const STORAGE_KEY = "rhythm-trainer.tapping-precision";

type Preference = Readonly<{ precision: TappingPrecision; storageAvailable: boolean }>;
let current: Preference = { precision: DEFAULT_TAPPING_PRECISION, storageAvailable: true };

function parsePrecision(value: unknown): TappingPrecision {
  return tappingPrecisions.find(item => item.id === value)?.id ?? DEFAULT_TAPPING_PRECISION;
}

/** 启动时读取偏好；损坏值回退标准，不自动覆盖存储。 */
export function initializeTappingPrecision(): Preference {
  try {
    current = { precision: parsePrecision(globalThis.localStorage.getItem(STORAGE_KEY)), storageAvailable: true };
  } catch {
    current = { precision: DEFAULT_TAPPING_PRECISION, storageAvailable: false };
  }
  return current;
}

export function getTappingPrecision(): Preference {
  return current;
}

/** 选择立即留在本页会话中；保存失败仍供下一轮使用，刷新后不保证保留。 */
export function selectTappingPrecision(precision: TappingPrecision): Preference {
  const next = parsePrecision(precision);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, next);
    current = { precision: next, storageAvailable: true };
  } catch {
    current = { precision: next, storageAvailable: false };
  }
  return current;
}

/** 新一轮开始时读取独立窗口快照；之后的设置变化不能修改这份参数。 */
export function getTappingTimingWindows(precision = current.precision): TimingWindows {
  const selected = parsePrecision(precision);
  const { windows } = tappingPrecisions.find(item => item.id === selected)!;
  return { ...windows };
}
