import { useEffect, useState } from "react";

/** 占位立即参与滚动恢复判断；只有较长等待才显示、播报文案，不延迟实际内容。 */
export function LoadingPlaceholder({ workspace = false, label = "正在加载…" }: { workspace?: boolean; label?: string }) {
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounce(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className={`loading-placeholder${workspace ? " loading-placeholder--workspace" : ""}`} data-navigation-pending aria-busy="true">
    <p role="status">{announce ? label : null}</p>
    <div className="loading-placeholder-shape" aria-hidden="true" />
  </div>;
}
