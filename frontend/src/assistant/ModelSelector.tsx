import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, X } from "lucide-react";
import { providers, providerNames, type ModelSelection, type Provider } from "../api/modelConnections";

import { useModelCatalog } from "./useModelCatalog";

type Props = {
  selection: ModelSelection | null | undefined;
  disabled: boolean;
  onSelect: (selection: ModelSelection) => Promise<boolean>;
  onAvailable: (available: boolean, selection: ModelSelection | null) => void;
};

/** 会话选择由服务端保存；目录读取与刷新独立，失败时仍可使用已有目录 */
export function ModelSelector({ selection, disabled, onSelect, onAvailable }: Props) {
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
  const selectedProvider = selected?.provider, selectedModel = selected?.model;
  useEffect(() => {
    onAvailable(available, selectedProvider && selectedModel ? { provider: selectedProvider, model: selectedModel } : null);
  }, [available, selectedProvider, selectedModel, onAvailable]);
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
                disabled={disabled || data[name].needs_authorization} onSelect={() => { void choose(name, item.id); }}>
                <span>{item.name}</span>{selected?.provider === name && selected.model === item.id && <Check size={16} aria-label="当前模型" />}
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
