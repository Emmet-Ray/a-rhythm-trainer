import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigationType } from "react-router";
import { PageVisits } from "./PageVisits";
export const VisitsContext = createContext<PageVisits | null>(null);

/** 调用方仅声明需要保留的 UI 字段。页面须按 location.key 挂载，业务状态不自动保存。 */
export function useVisitState<T>(field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const visits = useContext(VisitsContext);
  const { key } = useLocation();
  const [value, setValue] = useState(() => visits ? visits.read(key, field, initial) : initial);
  const current = useRef(value);
  const update = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (value: T) => T)(current.current) : next;
    current.current = resolved;
    visits?.write(key, field, resolved);
    setValue(resolved);
  }, [visits, key, field]);
  return [value, update];
}

/** 等待路由及异步页面内容就绪后恢复；用户主动滚动时停止接管视野。
 * 数据身份纳入滚动快照，避免不同账号复用位置。加载区须标记 data-navigation-pending。
 */
export function useNavigationScroll(identity: string) {
  const visits = useContext(VisitsContext);
  const location = useLocation();
  const action = useNavigationType();
  useLayoutEffect(() => {
    if (!visits) return;
    const path = location.pathname + location.search + location.hash;
    visits.enter({ key: location.key, path }, action);
    const key = location.pathname.startsWith("/custom") ? `${location.key}:${identity}` : location.key;
    const target = action === "POP" ? visits.position(key) : 0;
    const main = document.getElementById("main-content");
    if (!main) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    let restoring = true;
    let frame = 0;
    function remember() {
      if (!restoring) visits!.savePosition(key, window.scrollY);
    }
    function finish() {
      if (!restoring) return;
      restoring = false;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    }
    function restore() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!restoring || main!.querySelector("[data-navigation-pending]")) return;
        main!.focus({ preventScroll: true });
        window.scrollTo({ top: target, behavior: "instant" });
        finish();
        remember();
      });
    }
    const observer = new MutationObserver(restore);
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-navigation-pending"] });
    function interrupt(event: Event) {
      if (event instanceof KeyboardEvent && !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      finish();
      remember();
    }
    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", interrupt);
    // 点击前保存，避免导航提交后页面变短导致浏览器自动夹取滚动位置。
    document.addEventListener("click", remember, true);
    restore();
    return () => {
      finish();
      window.history.scrollRestoration = previous;
      window.removeEventListener("scroll", remember);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", interrupt);
      document.removeEventListener("click", remember, true);
    };
  }, [visits, location.key, location.pathname, location.search, location.hash, action, identity]);
}
