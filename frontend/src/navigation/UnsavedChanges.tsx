import { useContext, useEffect } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";

/** Protect edits on in-app navigation and reload; server/static renders need no router blocker. */
export function UnsavedChanges({ dirty }: { dirty: boolean }) {
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
