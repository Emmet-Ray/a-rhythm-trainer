import type { RhythmEvent } from "./RhythmModel";

// 快捷输入不是新的模型元素；图形和插入内容共同读取此定义。
export const rhythmPatterns = [
  { id: "two-eighths", label: "二平均", events: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "eighth" }] },
  { id: "four-sixteenths", label: "四平均", events: Array.from({ length: 4 }, () => ({ kind: "note", noteValue: "sixteenth" })) },
  { id: "eighth-two-sixteenths", label: "前八后十六", events: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "sixteenth" }] },
  { id: "two-sixteenths-eighth", label: "前十六后八", events: [{ kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "eighth" }] },
  { id: "dotted-eighth-sixteenth", label: "小附点", events: [{ kind: "note", noteValue: "eighth", dots: 1 }, { kind: "note", noteValue: "sixteenth" }] },
  { id: "sixteenth-dotted-eighth", label: "反小附点", events: [{ kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "eighth", dots: 1 }] },
  { id: "small-syncopation", label: "小切分", events: [{ kind: "note", noteValue: "sixteenth" }, { kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "sixteenth" }] },
  { id: "dotted-quarter-eighth", label: "大附点", events: [{ kind: "note", noteValue: "quarter", dots: 1 }, { kind: "note", noteValue: "eighth" }] },
  { id: "eighth-dotted-quarter", label: "反大附点", events: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "quarter", dots: 1 }] },
  { id: "large-syncopation", label: "大切分", events: [{ kind: "note", noteValue: "eighth" }, { kind: "note", noteValue: "quarter" }, { kind: "note", noteValue: "eighth" }] },
] as const satisfies readonly { id: string; label: string; events: readonly RhythmEvent[] }[];
