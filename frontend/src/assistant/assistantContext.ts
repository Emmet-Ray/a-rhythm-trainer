import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";

import type { GeneratedExercise } from "../exercises/GeneratedExercise";

export type ApplyExercise = (proposal: GeneratedExercise) => boolean;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type PageContext = { page: string; description: string; state: { [key: string]: JsonValue } };

/** 每个访问及身份范围一个实例。快照独立于编辑器，旧提供者不能清除新提供者。 */
export class AssistantContext {
  private editors = new Map<symbol, ApplyExercise | null>();
  private applyExercise: ApplyExercise | null = null;
  /** 面板内编辑器优先；背景编辑器更新不能抢占，面板卸载后恢复背景入口。 */
  registerApply(owner: symbol, apply: ApplyExercise | null) {
    this.editors.set(owner, apply);
    this.updateApply();
  }
  removeApply(owner: symbol) {
    this.editors.delete(owner);
    this.updateApply();
  }
  private updateApply() {
    const next = [...this.editors.values()].at(-1) ?? null;
    if (next === this.applyExercise) return;
    this.applyExercise = next;
    this.notify();
  }
  getApplySnapshot = () => this.applyExercise;

  private current: PageContext | null = null;
  private owner: symbol | null = null;
  private serialized = "";
  private listeners = new Set<() => void>();
  publish(owner: symbol, context: PageContext) {
    const serialized = JSON.stringify(context);
    if (this.owner === owner && this.serialized === serialized) return;
    this.current = structuredClone(context);
    this.owner = owner;
    this.serialized = serialized;
    this.notify();
  }
  remove(owner: symbol) {
    if (this.owner !== owner) return;
    this.current = null;
    this.owner = null;
    this.serialized = "";
    this.notify();
  }
  private sections = new Map<symbol, { name: string; value: JsonValue }>();
  /** 子面板补充页面字段，关闭只移除自己的数据，不替换基础页面或练习上下文。 */
  publishSection(owner: symbol, name: string, value: JsonValue) {
    this.sections.set(owner, { name, value: structuredClone(value) });
  }
  removeSection(owner: symbol) { this.sections.delete(owner); }
  private practices = new Map<symbol, { title: string; read: () => JsonValue }>();
  private recentPractice: { title: string; read: () => JsonValue } | null = null;
  /** 工作区独立于页面注册；覆盖层优先，关闭后恢复底层练习或保留刚才的练习。 */
  publishPractice(owner: symbol, title: string, read: () => JsonValue) {
    this.practices.set(owner, { title, read });
  }
  removePractice(owner: symbol) {
    const practice = this.practices.get(owner);
    if (!practice) return;
    this.recentPractice = practice;
    this.practices.delete(owner);
  }
  readCurrentPageContext = (): PageContext | null => {
    const active = [...this.practices.values()].at(-1);
    const practice = active ?? this.recentPractice;
    if (!practice && !this.current && !this.sections.size) return null;
    const page = this.current ?? { page: "practice", description: "节奏练习", state: {} };
    return structuredClone({ ...page, state: { ...page.state,
      ...Object.fromEntries([...this.sections.values()].map(({ name, value }) => [name, value])),
      ...(practice ? { practice: { scope: active ? "current" : "recent", snapshot: practice.read() } } : {}) } });
  };
  // React 订阅需要稳定引用；业务调用者使用上面的独立副本。
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify() { this.listeners.forEach(listener => listener()); }
}

export const AssistantContextScope = createContext<AssistantContext | null>(null);

/** 只发布已提交的页面状态；卸载时注销，不改变页面自己的草稿。 */
export function useAssistantPageContext(context: PageContext | null) {
  const scope = useContext(AssistantContextScope);
  const [owner] = useState(() => Symbol("page-context"));
  useLayoutEffect(() => { if (context) scope?.publish(owner, context); else scope?.remove(owner); });
  useLayoutEffect(() => () => scope?.remove(owner), [scope, owner]);
}

const emptySnapshot = () => null;
const emptySubscribe = () => () => {};
export function useAssistantContext() {
  const scope = useContext(AssistantContextScope);
  const snapshot = useSyncExternalStore(scope?.subscribe ?? emptySubscribe,
    scope?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return { snapshot, readCurrentPageContext: scope?.readCurrentPageContext ?? emptySnapshot };
}

/** 应用能力仅在当前编辑器挂载时存在，路由或身份切换会注销。 */
export function useAssistantExerciseTarget(apply: ApplyExercise | null) {
  const scope = useContext(AssistantContextScope);
  const [owner] = useState(() => Symbol("exercise-target"));
  useLayoutEffect(() => { scope?.registerApply(owner, apply); }, [scope, owner, apply]);
  useLayoutEffect(() => () => scope?.removeApply(owner), [scope, owner]);
}

export function useApplyAssistantExercise() {
  const scope = useContext(AssistantContextScope);
  return useSyncExternalStore(scope?.subscribe ?? emptySubscribe,
    scope?.getApplySnapshot ?? emptySnapshot, emptySnapshot);
}

/** 延迟到发送消息时读取轮次与历史，播放期间不因每次判定刷新整个助手。 */
export function useAssistantPractice(title: string | null, read: () => JsonValue) {
  const scope = useContext(AssistantContextScope);
  const [owner] = useState(() => Symbol("practice-context"));
  useLayoutEffect(() => {
    if (title !== null) scope?.publishPractice(owner, title, read);
    else scope?.removePractice(owner);
  });
  useLayoutEffect(() => () => scope?.removePractice(owner), [scope, owner]);
}

/** 当前展开的子面板资料；随页面作用域或子面板卸载清除。 */
export function useAssistantPageSection(name: string, value: JsonValue | null) {
  const scope = useContext(AssistantContextScope);
  const [owner] = useState(() => Symbol("page-section"));
  useLayoutEffect(() => {
    if (value === null) scope?.removeSection(owner);
    else scope?.publishSection(owner, name, value);
  });
  useLayoutEffect(() => () => scope?.removeSection(owner), [scope, owner]);
}
