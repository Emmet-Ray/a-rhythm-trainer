import { flushSync } from "react-dom";
import { useLayoutEffect, useRef, type RefObject } from "react";

/** 条件挂载的浮层在退出后卸载。重复关闭只执行一次；卸载取消动画，减少动态效果时立即关闭。
 * 播放停止等业务行为应在调用前完成，不能等待视觉退出。 */
export function useAnimatedDismiss<T extends HTMLElement>(element: RefObject<T | null>, onDismiss: () => void, enabled = true) {
  const pending = useRef<Animation | null>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => { dismiss.current = onDismiss; });
  useLayoutEffect(() => {
    const target = element.current;
    const inert = target?.inert;
    return () => {
      const animation = pending.current;
      pending.current = null;
      animation?.cancel();
      if (target && animation) { target.toggleAttribute("inert", inert ?? false); target.removeAttribute("data-dismissing"); }
    };
  }, [element, enabled]);
  return () => {
    if (!enabled || pending.current) return;
    const target = element.current;
    if (!target || !target.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dismiss.current(); return;
    }
    const style = getComputedStyle(target);
    const inert = target.inert;
    target.setAttribute("inert", "");
    target.setAttribute("data-dismissing", "");
    const animation = target.animate([
      { opacity: style.opacity, translate: style.translate },
      { opacity: 0, translate: style.getPropertyValue("--surface-offset").trim() || "0 6px" },
    ], { duration: 140, easing: "ease-in", fill: "forwards" });
    pending.current = animation;
    void animation.finished.catch(() => {}).then(() => {
      if (pending.current !== animation) return;
      pending.current = null;
      // 先提交关闭／卸载，再撤销 fill，避免 React 尚未提交时露出完整面板一帧。
      flushSync(() => dismiss.current());
      target.toggleAttribute("inert", inert);
      target.removeAttribute("data-dismissing");
      animation.cancel();
    });
  };
}
