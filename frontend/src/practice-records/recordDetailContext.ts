import { createContext, type ReactNode } from "react";
import type { PracticeRecord } from "./PracticeRecord";

export type RecordDetailSnapshot = {
  tab: "attempts" | "score";
  page: number;
  pages: number;
  totalAttempts: number;
  record: PracticeRecord;
  visibleRecord: PracticeRecord;
};

/** 由应用接入详情上下文展示；详情自身不依赖助手，独立使用时无需提供。 */
export const RecordDetailContext = createContext<((snapshot: RecordDetailSnapshot) => ReactNode) | null>(null);
