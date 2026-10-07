import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigationType } from "react-router";
import { PageVisits } from "./PageVisits";
export const VisitsContext = createContext<PageVisits | null>(null);

/** 仅用于会话内浏览偏好，字段须包含所属栏目、模式及数据身份；刷新不保留。
 * 新访问继承最近选择，后退恢复原快照，并将其作为最近浏览状态。
 */
export function useBrowsingState<T>(field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const visits = useContext(VisitsContext);
  const { key } = useLocation();
  const [value, setValue] = useState(() => {
    const create = () => typeof initial === "function" ? (initial as () => T)() : initial;
    return visits ? visits.readBrowsing(key, field, create) : create();
  });
  const current = useRef(value);
  useLayoutEffect(() => { visits?.rememberBrowsing(field, value); }, [visits, field, value]);
  const update = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (value: T) => T)(current.current) : next;
    current.current = resolved;
    visits?.write(key, field, resolved);
    visits?.rememberBrowsing(field, resolved);
    setValue(resolved);
  }, [visits, key, field]);
  return [value, update];
}

/** 只给浏览列表延续滚动；练习、编辑页的新访问仍从顶部开始。 */
export function browsingScrollScope(pathname: string): string | undefined {
  if (["/preset", "/records", "/random", "/custom"].includes(pathname)
    || /^\/custom\/(tapping|dictation)$/.test(pathname)) {
    return `browse-scroll:${pathname}`;
  }
}

/** 页面须按 location.key 及状态字段挂载，状态以不可变数据更新。
 * 函数初值按访问惰性创建并保存，返回时不会重新调用；状态值本身不支持函数。
 * forget 仅清除匹配版本的快照，不改变当前画面，可在异步保存成功后调用。
 */
export function useVisitState<T>(field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>, (expected: T) => void] {
  const visits = useContext(VisitsContext);
  const { key } = useLocation();
  const [value, setValue] = useState(() => {
    if (typeof initial === "function") {
      const create = initial as () => T;
      return visits ? visits.readOrCreate(key, field, create) : create();
    }
    return visits ? visits.read(key, field, initial) : initial;
  });
  const current = useRef(value);
  const update = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (value: T) => T)(current.current) : next;
    current.current = resolved;
    visits?.write(key, field, resolved);
    setValue(resolved);
  }, [visits, key, field]);
  const forget = useCallback((expected: T) => visits?.forget(key, field, expected), [visits, key, field]);
  return [value, update, forget];
}

/** 等待正文就绪后恢复焦点与滚动，再执行一次路由入场；用户操作立即中止接管。
 * 加载区须标记 data-navigation-pending。
 */
export function useNavigationPresentation() {
  const visits = useContext(VisitsContext);
  const location = useLocation();
  const action = useNavigationType();
  const previousPath = useRef(location.pathname);
  useLayoutEffect(() => {
    if (!visits) return;
    const entering = previousPath.current !== location.pathname && location.pathname !== "/";
    previousPath.current = location.pathname;
    const path = location.pathname + location.search + location.hash;
    visits.enter({ key: location.key, path }, action);
    const key = location.key;
    const scope = browsingScrollScope(location.pathname);
    const target = scope
      ? visits.readBrowsing(key, scope, () => 0)
      : action === "POP" ? visits.position(key) : 0;
    const main = document.getElementById("main-content");
    if (!main) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    let restoring = true;
    let frame = 0;
    let entrance: Animation | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelEntrance = () => entrance?.cancel();
    reducedMotion.addEventListener("change", cancelEntrance);
    function remember() {
      if (!restoring) {
        visits!.savePosition(key, window.scrollY);
        if (scope) {
          visits!.write(key, scope, window.scrollY);
          visits!.rememberBrowsing(scope, window.scrollY);
        }
      }
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
        if (entering && !reducedMotion.matches && typeof main!.animate === "function") {
          entrance = main!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        }
      });
    }
    const observer = new MutationObserver(restore);
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-navigation-pending"] });
    function interrupt(event: Event) {
      if (event instanceof KeyboardEvent && !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      cancelEntrance();
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
      cancelEntrance();
      reducedMotion.removeEventListener("change", cancelEntrance);
      finish();
      window.history.scrollRestoration = previous;
      window.removeEventListener("scroll", remember);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", interrupt);
      document.removeEventListener("click", remember, true);
    };
  }, [visits, location.key, location.pathname, location.search, location.hash, action]);
}
