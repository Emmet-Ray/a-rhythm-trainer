import { Modal } from "../ui/Modal";
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
  if (blocker.state !== "blocked") return null;
  return <Modal title="离开编辑页" description="未保存的修改将丢失。" onClose={() => blocker.reset()}>
    {close => <div className="app-dialog-footer">
      <button type="button" data-dialog-autofocus onClick={close}>取消</button>
      <button type="button" className="app-dialog-danger" onClick={() => blocker.proceed()}>离开</button>
    </div>}
  </Modal>;
}
