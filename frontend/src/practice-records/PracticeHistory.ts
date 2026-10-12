import type { PracticeRecord } from "./PracticeRecord";

/** 历史读取状态与数据一起传递；未加载、读取失败和已确认无记录是不同事实。 */
export type PracticeHistory =
  | { status: "available"; record?: PracticeRecord; total: number; attemptIds: string[] }
  | { status: "not-loaded" | "read-error" | "unavailable" };
