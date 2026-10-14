import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useAnimatedDismiss } from "./useAnimatedDismiss";
import { lockModalScroll } from "./modalScroll";

/** 条件挂载的居中弹窗：统一焦点、滚动锁和退出动效，业务只提供内容及操作。 */
export function Modal({ title, description, busy = false, closeLabel = "关闭", onClose, children }: {
  title: string; description?: string; busy?: boolean; closeLabel?: string;
  onClose: () => void; children: (close: () => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  const dismiss = useAnimatedDismiss(dialog, onClose);
  const close = () => { if (!busy) dismiss(); };
  useLayoutEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement;
    const unlock = lockModalScroll();
    element.showModal();
    const focus = element.querySelector<HTMLElement>("[data-dialog-autofocus]");
    focus?.focus({ preventScroll: true });
    if (focus instanceof HTMLInputElement) focus.select();
    return () => {
      element.close(); unlock();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="design-system app-dialog" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
    <div className="app-dialog-heading"><h2 id={titleId}>{title}</h2>
      <button type="button" aria-label={closeLabel} disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button>
    </div>
    {description && <p id={descriptionId} className="app-dialog-description">{description}</p>}
    {children(close)}
  </dialog>;
}
