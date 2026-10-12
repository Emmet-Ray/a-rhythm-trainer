import { AsyncStatus } from "./AsyncStatus";

/** 占位立即参与滚动恢复判断；只有较长等待才显示、播报文案，不延迟实际内容。 */
export function LoadingPlaceholder({ workspace = false, label = "正在加载…" }: { workspace?: boolean; label?: string }) {
  return <div className={`loading-placeholder${workspace ? " loading-placeholder--workspace" : ""}`} data-navigation-pending aria-busy="true">
    <AsyncStatus pending label={label} />
    <div className="loading-placeholder-shape" aria-hidden="true" />
  </div>;
}
