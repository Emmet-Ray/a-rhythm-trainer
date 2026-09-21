import { useEffect, useEffectEvent } from "react";

/** Single-letter shortcuts must not intercept typing, native controls, or modal interaction. */
export function canUsePracticeShortcut(event: KeyboardEvent): boolean {
  return !event.defaultPrevented && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
    && !document.querySelector("dialog[open]")
    && !document.querySelector(".practice-shortcuts-panel:popover-open")
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
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
      if (!canUsePracticeShortcut(event)) return;
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
