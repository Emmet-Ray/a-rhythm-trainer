import { useCallback, useEffect, useRef, useState } from "react";
import { providers, requestConnections, type Connections, type ModelSelection } from "../api/modelConnections";

/** 管理公开连接和目录的加载；缓存时效由服务端决定，选模不刷新连接 */
export function useModelCatalog() {
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const recentSelection = useRef<{ revision: number; choice: ModelSelection | null }>({ revision: 0, choice: null });
  const load = useCallback((signal: AbortSignal) => {
    const current = ++generation.current;
    const selectionRevision = recentSelection.current.revision;
    // A directory response started before a model change must not restore the old default
    const preserveSelection = (value: Connections) => {
      const { revision, choice } = recentSelection.current;
      return revision !== selectionRevision && choice ? { ...value, provider: choice.provider,
        [choice.provider]: { ...value[choice.provider], model: choice.model } } : value;
    };
    const active = () => !signal.aborted && generation.current === current;
    return requestConnections("", "GET", undefined, signal).then(async value => {
      if (!active()) return;
      setError("");
      setData(preserveSelection(value));
      const configured = providers.filter(name => value[name].configured);
      setRefreshing(configured.length > 0);
      const results = await Promise.allSettled(configured.map(async name => {
        const updated = await requestConnections(`/${name}/models?force=false`, "POST", undefined, signal);
        if (active()) setData(previous => previous ? { ...previous, [name]: { ...updated[name], model: previous[name].model } } : updated);
      }));
      if (active() && results.some(result => result.status === "rejected")) {
        // Refresh may have discovered revoked credentials; re-read public status
        // without discarding cached models or treating a network failure as logout.
        const latest = await requestConnections("", "GET", undefined, signal);
        if (active()) {
          setData(preserveSelection(latest));
          setError(providers.some(name => latest[name].needs_authorization)
            ? "部分服务的凭证已失效，请在设置中更新连接"
            : "部分模型列表未能更新，已保留上次的列表");
        }
      }
    }).catch(() => { if (active()) setError("无法读取模型服务，请重试"); })
      .finally(() => { if (active()) setRefreshing(false); });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const changed = () => { void load(controller.signal); };
    const selected = (event: Event) => {
      const choice = (event as CustomEvent<ModelSelection>).detail;
      recentSelection.current = { revision: recentSelection.current.revision + 1, choice };
      setData(previous => previous ? { ...previous, provider: choice.provider,
        [choice.provider]: { ...previous[choice.provider], model: choice.model } } : previous);
    };
    window.addEventListener("model-connections-changed", changed);
    window.addEventListener("model-selection-changed", selected);
    return () => { controller.abort(); window.removeEventListener("model-connections-changed", changed); window.removeEventListener("model-selection-changed", selected); };
  }, [load, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { data, error, refreshing, reload };
}
