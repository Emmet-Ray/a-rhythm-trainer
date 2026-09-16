import { parsePresetCatalog, type PresetCatalog } from "./presetCatalog";

type CatalogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; catalog: PresetCatalog }
  | { status: "error"; message: string };

/** 当前页面生命周期内缓存一次成功结果，合并预加载与页面请求；失败只在明确重试时重读。 */
export function createPresetCatalogStore(fetchCatalog: typeof fetch = (...args) => fetch(...args)) {
  let state: CatalogState = { status: "idle" };
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  function publish(next: CatalogState) {
    state = next;
    listeners.forEach(listener => listener());
  }
  function load(retry = false): Promise<void> {
    if (pending) return pending;
    if (state.status === "ready" || (state.status === "error" && !retry)) return Promise.resolve();
    publish({ status: "loading" });
    pending = Promise.resolve().then(async () => {
      try {
        const response = await fetchCatalog("/content/preset-exercises.json", {
          cache: "no-cache", signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const catalog = parsePresetCatalog(await response.json());
        publish({ status: "ready", catalog });
      } catch {
        publish({ status: "error", message: "题库暂时无法读取，请检查网络后重试；若仍失败，请联系维护者检查题库文件。" });
      } finally {
        pending = undefined;
      }
    });
    return pending;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
  };
}

export const presetCatalogStore = createPresetCatalogStore();
