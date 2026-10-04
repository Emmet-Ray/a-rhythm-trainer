import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";

import type { ExerciseProposal } from "./tool-results/exerciseProposal";

export type ApplyExercise = (proposal: ExerciseProposal) => boolean;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type PageContext = { page: string; description: string; state: { [key: string]: JsonValue } };

/** 每个访问及身份范围一个实例。快照独立于编辑器，旧提供者不能清除新提供者。 */
export class AssistantContext {
  private applyOwner: symbol | null = null;
  private applyExercise: ApplyExercise | null = null;
  registerApply(owner: symbol, apply: ApplyExercise | null) {
    if (this.applyOwner === owner && this.applyExercise === apply) return;
    this.applyOwner = owner;
    this.applyExercise = apply;
    this.notify();
  }
  removeApply(owner: symbol) {
    if (this.applyOwner !== owner) return;
    this.applyOwner = null; this.applyExercise = null; this.notify();
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
  readCurrentPageContext = (): PageContext | null => structuredClone(this.current);
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
export function useAssistantPageContext(context: PageContext) {
  const scope = useContext(AssistantContextScope);
  const [owner] = useState(() => Symbol("page-context"));
  useLayoutEffect(() => { scope?.publish(owner, context); });
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
