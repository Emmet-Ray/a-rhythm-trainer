import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, usePanelCallbackRef } from "react-resizable-panels";
import { AssistantPanel } from "./AssistantPanel";

const storageKey = "rhythm:assistant-width:v1";
const minAssistantWidth = 360;
const maxAssistantWidth = 960;
function readWidth() {
  try {
    const value = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(value) && value >= minAssistantWidth && value <= maxAssistantWidth) return value;
  } catch { /* 无法保存偏好时仍可调整宽度。 */ }
  return 460;
}

/** 页面与助手始终留在各自面板中；首页独占、窄屏模态及收起只改变尺寸。
 * 仅保存用户调整的宽度，不让窗口约束或模式切换覆盖用户偏好。 */
export function AssistantWorkspace({ home, children }: { home: boolean; children: ReactNode }) {
  const [docked, setDocked] = useState(false);
  const groupElement = useRef<HTMLDivElement>(null);
  const separatorElement = useRef<HTMLDivElement>(null);
  const [assistant, assistantRef] = usePanelCallbackRef();
  const [initialWidth] = useState(readWidth);
  const width = useRef(initialWidth);
  const split = !home && docked;
  useLayoutEffect(() => {
    assistant?.resize(home ? "100%" : split ? width.current : 0);
  }, [assistant, home, split]);

  return <Group className="assistant-workspace" orientation="horizontal" disabled={!split}
    elementRef={groupElement} data-home={home} data-split={split} style={{ overflow: "visible" }}
    onLayoutChanged={(layout, meta) => {
      if (!split || !meta.isUserInteraction || !groupElement.current || !separatorElement.current) return;
      // 回调可能先于 DOM 更新，按新布局计算宽度，避免保存调整前的尺寸。
      const availableWidth = groupElement.current.clientWidth - separatorElement.current.offsetWidth;
      width.current = Math.round(availableWidth * layout.assistant / 100);
      try { localStorage.setItem(storageKey, String(width.current)); } catch { /* 偏好存储可选。 */ }
    }}>
    <Panel id="page" minSize={split ? 480 : 0} defaultSize={home ? "0%" : "100%"} style={{ overflow: "visible" }}>
      {children}
    </Panel>
    <Separator elementRef={separatorElement} disableDoubleClick className="assistant-resize-handle" disabled={!split} hidden={!split}
      aria-label="调整助手宽度" />
    <Panel id="assistant" role={home ? "main" : undefined} tabIndex={home ? -1 : undefined} panelRef={assistantRef} defaultSize={home ? "100%" : "0%"}
      minSize={split ? minAssistantWidth : 0} maxSize={home ? "100%" : split ? maxAssistantWidth : "0%"}
      groupResizeBehavior="preserve-pixel-size" style={{ overflow: "visible" }}>
      <AssistantPanel home={home} onDockChange={setDocked} />
    </Panel>
  </Group>;
}
