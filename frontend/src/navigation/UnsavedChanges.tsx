import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";

type RegisterDraft = (owner: symbol, dirty: boolean) => void;
const DraftsContext = createContext<RegisterDraft | null>(null);

/** 页面与覆盖面板可能同时有草稿；路由只挂一个拦截器，任一草稿未保存都需确认。 */
export function UnsavedChangesScope({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<ReadonlySet<symbol>>(() => new Set());
  const register = useCallback<RegisterDraft>((owner, dirty) => {
    setDrafts(previous => {
      if (previous.has(owner) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(owner); else next.delete(owner);
      return next;
    });
  }, []);
  return <DraftsContext value={register}><Protection dirty={drafts.size > 0} />{children}</DraftsContext>;
}

export function UnsavedChanges({ dirty }: { dirty: boolean }) {
  const register = useContext(DraftsContext);
  const [owner] = useState(() => Symbol("draft"));
  useLayoutEffect(() => { register?.(owner, dirty); }, [register, owner, dirty]);
  useLayoutEffect(() => () => register?.(owner, false), [register, owner]);
  return register ? null : <Protection dirty={dirty} />;
}

function Protection({ dirty }: { dirty: boolean }) {
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  return router ? <NavigationGuard dirty={dirty} /> : null;
}

function NavigationGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("修改尚未保存，确定离开编辑页吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  return null;
}
