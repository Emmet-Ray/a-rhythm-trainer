import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmationContext, type Confirmation, type Confirm } from "./confirmation";
import { Modal } from "./Modal";

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>((options, signal) => {
    if (pending.current || signal.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      const abort = () => finish(false);
      const finish = (accepted: boolean) => {
        signal.removeEventListener("abort", abort);
        pending.current = null; setRequest(null); resolve(accepted && !signal.aborted);
      };
      pending.current = finish;
      signal.addEventListener("abort", abort, { once: true });
      setRequest(options);
    });
  }, []);
  useEffect(() => () => pending.current?.(false), []);
  return <ConfirmationContext value={confirm}>{children}
    {request && <Modal title={request.title} description={request.description} onClose={() => pending.current?.(false)}>
      {close => <div className="app-dialog-footer">
        <button type="button" data-dialog-autofocus onClick={close}>取消</button>
        <button type="button" className={request.danger ? "app-dialog-danger" : "app-dialog-primary"} onClick={() => pending.current?.(true)}>{request.confirmLabel}</button>
      </div>}
    </Modal>}
  </ConfirmationContext>;
}
