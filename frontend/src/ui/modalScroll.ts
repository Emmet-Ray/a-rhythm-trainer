let locks = 0;
let previous = "";
/** 嵌套弹窗共享滚动锁，最后一层关闭后恢复页面。 */
export function lockModalScroll() {
  if (locks++ === 0) { previous = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = previous;
  };
}
