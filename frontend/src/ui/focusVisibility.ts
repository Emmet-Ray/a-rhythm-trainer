const navigationKeys = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter", " "]);

/** 保留原生焦点与弹层恢复，只修正鼠标操作后 Esc／字母快捷键引起的描边。
 * 默认沿用浏览器判断；明确键盘导航恢复原生提示，文本输入始终使用原生样式。
 * 全文档监听覆盖 portal、原生 dialog 和第三方弹层，不由各入口维护平行规则。
 */
export function initializeFocusVisibility(document: Document) {
  let pointerMode = false;
  let marked: Element | null = null;
  let pointerSelect: Element | null = null;
  const clear = () => {
    marked?.removeAttribute("data-pointer-focus");
    marked = null;
  };
  const update = () => {
    clear();
    const focused = document.activeElement;
    // 原生 dialog、summary、SVG 等可隐式聚焦，不能靠标签／tabindex 枚举。
    // activeElement 已经给出了真实焦点；文本输入继续使用原生提示，选择控件与按钮统一区分操作路径。
    if (pointerMode && focused && focused !== document.body && focused !== document.documentElement
      && !(focused instanceof HTMLElement && focused.isContentEditable)
      && !focused.matches("input, textarea")) {
      focused.setAttribute("data-pointer-focus", "");
      marked = focused;
    }
  };
  const pointer = (event: PointerEvent) => {
    pointerSelect = event.target instanceof Element ? event.target.closest("select") : null;
    pointerMode = true;
    update();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (navigationKeys.has(event.key)) { pointerMode = false; pointerSelect = null; clear(); }
  };
  // 辅助技术的虚拟点击没有指针次数，保留可见焦点；脚本 click() 不改变模式。
  const click = (event: MouseEvent) => {
    // 原生下拉菜单鼠标选项提交也会产生 detail=0 的可信 click。
    // 只有同一个控件由指针打开且中途没有键盘导航时，保留指针模式。
    if (pointerMode && pointerSelect && event.target instanceof Element
      && event.target.closest("select") === pointerSelect) { update(); return; }
    if (event.isTrusted && event.detail === 0) { pointerMode = false; clear(); }
  };
  const blur = (event: FocusEvent) => {
    if (event.target === pointerSelect) pointerSelect = null;
    clear();
  };
  document.addEventListener("click", click, true);
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("keydown", keyboard, true);
  document.addEventListener("focusin", update, true);
  document.addEventListener("focusout", blur, true);
  return () => {
    clear();
    document.removeEventListener("click", click, true);
    document.removeEventListener("pointerdown", pointer, true);
    document.removeEventListener("keydown", keyboard, true);
    document.removeEventListener("focusin", update, true);
    document.removeEventListener("focusout", blur, true);
  };
}
