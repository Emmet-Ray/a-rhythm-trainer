import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, X } from "lucide-react";
import { providers, requestConnections, type Connections, providerNames, type ModelSelection, type Provider } from "../api/modelConnections";



type Props = {
  selection: ModelSelection | null | undefined;
  disabled: boolean;
  requiresImages?: boolean;
  onSelect: (selection: ModelSelection) => Promise<boolean>;
  onAvailable: (available: boolean, selection: ModelSelection | null, supportsImages: boolean) => void;
};

/** 会话选择由服务端保存；目录读取与刷新独立，失败时仍可使用已有目录 */
export function ModelSelector({ selection, disabled, requiresImages = false, onSelect, onAvailable }: Props) {
  const { data, error, refreshing, reload } = useModelCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  // undefined denotes a new conversation; null is an older conversation without a saved choice.
  const selected = selection === undefined && data
    ? (data[data.provider]?.model ? { provider: data.provider, model: data[data.provider].model } : null) : selection;
  const config = selected && data?.[selected.provider];
  const model = config && config.models.find(item => item.id === selected?.model);
  const available = !!(config?.configured && !config.needs_authorization && model);
  const supportsImages = !!model?.supports_images;
  const selectedProvider = selected?.provider, selectedModel = selected?.model;
  useEffect(() => {
    onAvailable(available, selectedProvider && selectedModel ? { provider: selectedProvider, model: selectedModel } : null, supportsImages);
  }, [available, selectedProvider, selectedModel, supportsImages, onAvailable]);
  function close() { setOpen(false); setSearch(""); setKeyboardNavigation(false); }
  async function choose(provider: Provider, model: string) {
    if (disabled) return;
    if (await onSelect({ provider, model })) close();
  }
  return <div className="assistant-model-control">
    <Popover.Root open={open} onOpenChange={value => { setOpen(value); setSearch(""); setKeyboardNavigation(false); if (value) { setPortalContainer(trigger.current?.closest("dialog") ?? undefined); reload(); } }}>
    <Popover.Trigger asChild>
    <button ref={trigger} type="button" className="assistant-model-trigger" aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
      title={selected && !available ? "请重新连接服务或选择其他模型" : "选择模型"}>
      <span>{!data ? "读取模型…" : selected ? `${model?.name ?? selected.model}${available ? "" : " · 不可用"}` : "选择模型"}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    </Popover.Trigger>
    {!open && error && <button type="button" className="assistant-model-retry" onClick={reload}>列表读取失败，重试</button>}
    <Popover.Portal container={portalContainer}>
    <Popover.Content className="design-system assistant-model-dialog" aria-label="选择模型" side="top" align="end" sideOffset={12} collisionPadding={12}
      data-keyboard-navigation={keyboardNavigation}
      onPointerMove={() => setKeyboardNavigation(false)}
      onKeyDownCapture={event => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (event.ctrlKey && ["n", "p", "j", "k"].includes(event.key))) setKeyboardNavigation(true); }}
      onOpenAutoFocus={event => { event.preventDefault(); searchInput.current?.focus(); }}
      onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); close(); }}>
      <div className="assistant-model-dialog-content">
        <div className="assistant-model-dialog-heading"><h2>选择模型</h2><button type="button" aria-label="关闭模型选择" onClick={close}><X size={18} /></button></div>
        <Command label="模型" loop>
          <Command.Input ref={searchInput} placeholder="搜索模型" value={search} onValueChange={value => { setSearch(value); setKeyboardNavigation(false); }} />
          <Command.List aria-label="可用模型">
            <Command.Empty>{refreshing ? "正在获取模型列表…" : "没有匹配的模型"}</Command.Empty>
            {providers.map(name => data?.[name].configured && <Command.Group key={name} heading={providerNames[name]}>
              {data[name].models.map(item => <Command.Item key={item.id} value={`${name}/${item.id}`} keywords={[item.name, providerNames[name]]}
                disabled={disabled || data[name].needs_authorization || (requiresImages && !item.supports_images)} onSelect={() => { void choose(name, item.id); }}>
                <span>{item.name}{requiresImages && !item.supports_images && <small className="assistant-model-unavailable">不支持图片</small>}</span>{selected?.provider === name && selected.model === item.id && <Check size={16} aria-label="当前模型" />}
              </Command.Item>)}
            </Command.Group>)}
          </Command.List>
        </Command>
        {error && <div className="assistant-error" role="alert">{error} <button type="button" className="assistant-model-retry" disabled={refreshing} onClick={reload}>重试</button></div>}
        {data && !providers.some(name => data[name].configured) && <p>请先在设置 → 模型服务中配置连接</p>}
      </div>
    </Popover.Content>
    </Popover.Portal>
    </Popover.Root>
  </div>;
}

/** 管理公开连接和目录的加载；缓存时效由服务端决定，选模不刷新连接 */
function useModelCatalog() {
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
