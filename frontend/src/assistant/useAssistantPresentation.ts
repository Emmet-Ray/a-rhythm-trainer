import { useAnimatedDismiss } from "../navigation/useAnimatedDismiss";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

const narrowQuery = "(max-width: 1099px)";
function subscribeViewport(notify: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const isNarrow = () => window.matchMedia(narrowQuery).matches;

/** 同一个面板在首页、并排侧栏和模态覆盖层之间切换，不重挂载对话及卡片。
 * 窄屏使用原生模态框隔离焦点和背景交互；收起不结束正在生成的回答。
 */
export function useAssistantPresentation(home: boolean, enabled = true) {
  const panel = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const narrow = useSyncExternalStore(subscribeViewport, isNarrow, () => false);
  const visible = home || (enabled && open);
  const modal = !home && enabled && open && narrow;

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const focused = document.activeElement;
    const keepFocus = focused instanceof HTMLElement && element.contains(focused);
    if (element.open && (!visible || element.matches(":modal") !== modal)) element.close();
    if (visible && !element.open) {
      if (modal) element.showModal();
      // 普通布局只改变可见性，不运行 dialog.show() 的自动聚焦步骤。
      // 用户主动打开时，由入口将焦点交给输入框。
      else element.open = true;
      if (keepFocus && focused.isConnected) focused.focus({ preventScroll: true });
    }
  }, [visible, modal]);

  useLayoutEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [modal]);

  const close = useAnimatedDismiss(panel, () => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }));
  }, !home && visible);
  return { panel, launcher, visible, modal, open: () => setOpen(true), close };
}
