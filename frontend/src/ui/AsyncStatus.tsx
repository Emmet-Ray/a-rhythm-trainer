import { useEffect, useState } from "react";

/** 保留提示位置；短请求不显示或播报加载文字，等待结束立即退出，不人为延迟结果。
 * initial 标记尚无可恢复内容的首次加载，供导航决定何时恢复滚动与焦点。
 */
export function AsyncStatus({ pending, initial = false, label = "正在更新…", className = "" }: {
  pending: boolean;
  initial?: boolean;
  label?: string;
  className?: string;
}) {
  return <div className={`async-status ${className}`.trim()} role="status" data-pending={pending}
    data-navigation-pending={initial && pending ? true : undefined}>
    {pending && <DelayedStatus label={label} />}
  </div>;
}

function DelayedStatus({ label }: { label: string }) {
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounce(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  return announce ? <span>{label}</span> : null;
}
