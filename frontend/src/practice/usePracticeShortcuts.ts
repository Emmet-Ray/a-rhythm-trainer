import { createContext, useContext, useEffect, useEffectEvent, type RefObject } from "react";

/** 覆盖层显式声明自己的键盘作用域；背景训练仍使用默认页面作用域。 */
export const PracticeKeyboardScope = createContext<RefObject<HTMLElement | null> | null>(null);

export function canReceivePracticeKey(scope: HTMLElement | null = null): boolean {
  if (document.querySelector(".practice-shortcuts-panel:popover-open")) return false;
  const modals = document.querySelectorAll("dialog:modal");
  if (!modals.length) return true;
  // 模态训练允许按钮失焦后的空格击拍；背景及更低层的训练不能响应。
  return scope?.closest("dialog:modal") === modals[modals.length - 1];
}

/** Single-letter shortcuts must not intercept typing, native controls, or modal interaction. */
export function canUsePracticeShortcut(event: KeyboardEvent, scope: HTMLElement | null = null): boolean {
  return !event.defaultPrevented && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
    && canReceivePracticeKey(scope)
    && !(event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, button, a, [role='textbox']")));
}

/** Event handling, button hints and help all use this definition. */
export const practiceShortcuts = {
  practice: { key: "H", label: "击拍练习" },
  listen: { key: "L", label: "试听" },
  answer: { key: "A", label: "播放我的答案" },
  verify: { key: "V", label: "验证当前小节" },
  reference: { key: "R", label: "查看答案／返回作答" },
  stop: { key: "S", label: "停止" },
  previous: { key: "P", label: "上一题" },
  next: { key: "N", label: "下一题" },
} as const;
export function practiceShortcutAction(code: string) {
  return (Object.keys(practiceShortcuts) as (keyof typeof practiceShortcuts)[]).find(action => `Key${practiceShortcuts[action].key}` === code);
}
export function usePracticeShortcuts(actions: Partial<Record<keyof typeof practiceShortcuts, () => void>>) {
  const scope = useContext(PracticeKeyboardScope);
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
      if (!canUsePracticeShortcut(event, scope?.current)) return;
      const name = practiceShortcutAction(event.code);
      const action = name ? actions[name] : undefined;
      if (!action) return;
      event.preventDefault();
      action();
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleKey(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
