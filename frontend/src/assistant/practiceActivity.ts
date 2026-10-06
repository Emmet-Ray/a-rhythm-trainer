import { createContext } from "react";
import type { PracticeRecord } from "../practice-records/PracticeRecord";
import { recordKey } from "../practice-records/practiceRecords";
import { buildPracticeContextSummary } from "./practiceContextSummary";

/** 会话内的成绩增量。只接受记录入口的结果，不追踪界面操作。
 * 同一次尝试覆盖旧版本；确认已接收的批次只清除当时版本，发送期间的新结果继续待发。
 */
export class PracticeActivity {
  private enabled = false;
  private revision = 0;
  private acknowledged = 0;
  private evictedThrough = 0;
  private attempts = new Map<string, { revision: number; record: PracticeRecord; historyEnabled: boolean }>();
  private references = new Map<string, string>();
  private reference(record: PracticeRecord) {
    const key = recordKey(record, record.exercise, record.mode);
    if (!this.references.has(key)) this.references.set(key, crypto.randomUUID());
    return this.references.get(key)!;
  }
  private batches = new Map<string, number>();
  private label = "";
  private focus: { source: string; exerciseId: string; title: string; mode: string; practiceRef: string } | null = null;
  getFocus = () => this.focus ? { ...this.focus } : null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getLabel = () => this.label;
  start() { this.enabled = true; }
  /** 恢复讨论对象，不把历史成绩重新当成待发送的新活动。 */
  restoreFocus(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const item = value as Record<string, unknown>;
    if (!["source", "exerciseId", "title", "mode", "practiceRef"].every(key => typeof item[key] === "string")) return;
    this.focus = { source: item.source as string, exerciseId: item.exerciseId as string, title: item.title as string,
      mode: item.mode as string, practiceRef: item.practiceRef as string };
    this.label = `最近练习：${this.focus.title}`;
    this.listeners.forEach(listener => listener());
  }
  reset() {
    this.enabled = false; this.revision = 0; this.acknowledged = 0; this.evictedThrough = 0;
    this.references.clear(); this.attempts.clear(); this.batches.clear(); this.label = ""; this.focus = null;
    this.listeners.forEach(listener => listener());
  }
  record(record: PracticeRecord, attemptId: string, historyEnabled: boolean) {
    if (!this.enabled) return;
    const attempt = record.attempts.find(item => item.id === attemptId);
    if (!attempt) return;
    const key = `${recordKey(record, record.exercise, record.mode)}:${attemptId}`;
    const previous = this.attempts.get(key);
    if (previous && JSON.stringify(previous.record.attempts.find(item => item.id === attemptId)) === JSON.stringify(attempt)) return;
    this.attempts.delete(key);
    this.attempts.set(key, { revision: ++this.revision, record: structuredClone({ ...record, attempts: [attempt] } as PracticeRecord), historyEnabled });
    // 保留最近100个更新的尝试，长期离开对话时不无限积累。
    while (this.attempts.size > 100) {
      const oldest = this.attempts.keys().next().value!;
      this.evictedThrough = Math.max(this.evictedThrough, this.attempts.get(oldest)!.revision);
      this.attempts.delete(oldest);
    }
    this.focus = { source: record.source, exerciseId: record.exerciseId, title: record.title, mode: record.mode, practiceRef: this.reference(record) };
    const label = `最近练习：${record.title}`;
    if (label !== this.label) { this.label = label; this.listeners.forEach(listener => listener()); }
  }
  prepare() {
    const pending = [...this.attempts.values()].filter(item => item.revision > this.acknowledged);
    if (!pending.length) return null;
    const groups = new Map<string, { record: PracticeRecord; historyEnabled: boolean }>();
    for (const item of pending) {
      const exerciseKey = recordKey(item.record, item.record.exercise, item.record.mode);
      const group = groups.get(exerciseKey) ?? { ...item };
      group.record = { ...item.record, attempts: [...group.record.attempts.filter(attempt => !item.record.attempts.some(next => next.id === attempt.id)), ...item.record.attempts] } as PracticeRecord;
      groups.delete(exerciseKey); groups.set(exerciseKey, group);
    }
    const practices = [...groups.values()].slice(-5).map(({ record, historyEnabled }) => ({
      ...buildPracticeContextSummary({ context: record, exercise: record.exercise, mode: record.mode,
        answerExposed: record.mode === "dictation" && (record.attempts.at(-1)?.viewedAnswer ?? false),
        session: record, historyEnabled }),
      practiceRef: this.reference(record),
    }));
    const batchId = crypto.randomUUID();
    this.batches.set(batchId, this.revision);
    while (this.batches.size > 32) this.batches.delete(this.batches.keys().next().value!);
    const bytes = () => new TextEncoder().encode(JSON.stringify(practices)).length;
    while (practices.length > 1 && bytes() > 20 * 1024) practices.shift();
    for (const practice of practices) {
      while (bytes() > 20 * 1024 && practice.history.recentAttempts.length) practice.history.recentAttempts.shift();
      while (bytes() > 20 * 1024 && practice.session.recentAttempts.length > 1) practice.session.recentAttempts.shift();
    }
    return { batchId, updateCount: this.revision - this.acknowledged,
      truncated: this.evictedThrough > this.acknowledged || practices.length < groups.size, includedPractices: practices.length, totalPractices: groups.size, practices };
  }
  acknowledge(batchId: string) {
    const revision = this.batches.get(batchId);
    if (revision === undefined) return;
    this.acknowledged = Math.max(this.acknowledged, revision);
    for (const [id, value] of this.batches) if (value <= revision) this.batches.delete(id);
  }
}

export const PracticeActivityContext = createContext<PracticeActivity | null>(null);
