import { createContext, useCallback, useContext, useEffect, useRef } from "react";
export type Confirmation = { title: string; description?: string; confirmLabel: string; danger?: boolean };
export type Confirm = (options: Confirmation, signal: AbortSignal) => Promise<boolean>;
export const ConfirmationContext = createContext<Confirm | null>(null);
/** 卸载调用方会取消未完成确认，防止旧页面继续执行操作；重复点击只保留一次确认。 */
export function useConfirm() {
  const confirm = useContext(ConfirmationContext);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => controller.abort();
  }, []);
  return useCallback((options: Confirmation) => {
    if (!confirm) throw new Error("缺少 ConfirmationProvider");
    if (!lifetime.current || lifetime.current.signal.aborted) return Promise.resolve(false);
    return confirm(options, lifetime.current.signal);
  }, [confirm]);
}
