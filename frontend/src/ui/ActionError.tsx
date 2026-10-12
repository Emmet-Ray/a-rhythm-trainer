import { useState } from "react";
import { CircleAlert, X } from "lucide-react";

/** 操作失败不占文档流，不自动消失；重试由调用方执行并维护错误状态。 */
export function ActionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (dismissed === message) return null;
  return <div className="success-toast-region action-error-region" role="alert">
    <div className="success-toast action-error">
      <CircleAlert className="ui-icon" aria-hidden="true" />
      <span>{message.replace(/。+$/, "")}</span>
      {onRetry && <button type="button" className="action-error-retry" onClick={onRetry}>重试保存</button>}
      <button className="success-toast-close" type="button" aria-label="关闭提示" onClick={() => setDismissed(message)}><X className="ui-icon" aria-hidden="true" /></button>
    </div>
  </div>;
}
