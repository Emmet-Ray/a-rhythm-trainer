import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

/** Mount once per successful action (use a new key for repeated saves).
 * Does not take focus or occupy document flow; navigation cancels the timer.
 */
export function SuccessToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [visible]);
  return <div className="success-toast-region" role="status" aria-live="polite" aria-atomic="true">
    {visible && <div className="success-toast">
      <Check className="ui-icon" aria-hidden="true" focusable="false" />
      <span>{message}</span>
      <button className="success-toast-close" type="button" aria-label="关闭提示" onClick={() => setVisible(false)}>
        <X className="ui-icon" aria-hidden="true" focusable="false" />
      </button>
    </div>}
  </div>;
}
