import { useContext, useState, type ReactNode } from "react";
import { Link, useNavigate, type LinkProps } from "react-router";
import { PageVisits } from "./PageVisits";
import { VisitsContext } from "./usePageNavigation";

export function PageNavigation({ children }: { children: ReactNode }) {
  const [visits] = useState(() => new PageVisits());
  return <VisitsContext value={visits}>{children}</VisitsContext>;
}

/** 保留链接的打开新标签等原生行为；当前会话内存在目标记录才进行历史返回。 */
export function ReturnLink({ to, onClick, ...props }: LinkProps & { to: string }) {
  const visits = useContext(VisitsContext);
  const navigate = useNavigate();
  return <Link {...props} to={to} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
    const distance = visits?.backDistance(to);
    if (distance !== undefined) {
      event.preventDefault();
      navigate(distance);
    }
  }} />;
}
