import { lockModalScroll } from "../ui/modalScroll";
import { useContext, useEffect, useRef, useState } from "react";
import { VisitsContext } from "./usePageNavigation";
import { Link, useLocation } from "react-router";
import { MessageCircle, ListMusic, Gamepad2, Settings, Info, Menu, X } from "lucide-react";
import BrandMark from "../brand/BrandMark";

const destinations = [
  { path: "/", shortLabel: "助手", label: "节奏助手", icon: MessageCircle },
  { path: "/practice", shortLabel: "练习", label: "练习", icon: ListMusic },
  { path: "/game", shortLabel: "游戏", label: "节奏游戏", icon: Gamepad2 },
  { path: "/settings", shortLabel: "设置", label: "设置", icon: Settings },
  { path: "/about", shortLabel: "关于", label: "关于", icon: Info },
];

// 练习栏目包含独立题目来源、记录及助手生成题；入口始终指向 /practice。
function isPracticePath(pathname: string) {
  return pathname === "/practice" || pathname === "/records"
    || /^\/(preset|random|custom)(\/|$)/.test(pathname)
    || /^\/ai\/(tapping|dictation)\//.test(pathname);
}

function NavigationLinks({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { pathname, search } = useLocation();
  const visits = useContext(VisitsContext);
  const settingsDestination = pathname === "/settings" ? pathname + search : visits?.destination("/settings") ?? "/settings";
  return <nav className="site-navigation" aria-label="主导航">
    {destinations.map(({ path, label, shortLabel, icon: Icon }) => {
      const practice = path === "/practice";
      const destination = path === "/settings" ? settingsDestination : path;
      const active = practice ? isPracticePath(pathname) : pathname === path || path !== "/" && pathname.startsWith(path + "/");
      return <Link key={path} to={destination}
      className={path === "/settings" ? "site-settings-link" : undefined}
      aria-current={active ? destination === pathname + search ? "page" : "location" : undefined}
      title={compact ? label : undefined} aria-label={compact ? label : undefined}
      onClick={event => {
        if (destination === pathname + search && event.button === 0
          && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
        }
        onNavigate?.();
      }}><Icon className="ui-icon" aria-hidden="true" focusable="false" /><span>{compact ? shortLabel : label}</span></Link>; })}
  </nav>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="brand" aria-label={compact ? "节奏训练首页" : undefined} title={compact ? "节奏训练首页" : undefined}><BrandMark className="brand-mark" />{!compact && "节奏训练"}</Link>;
}

/** 桌面固定导航与移动端模态菜单共用入口；关闭抽屉后交还浏览器焦点。 */
export default function SiteNavigation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    dialog.current?.close();
  }, [location.key]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1001px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!open) return;
    const unlockScroll = lockModalScroll();
    return () => { unlockScroll(); };
  }, [open]);
  return <>
    <aside className="site-sidebar design-system" data-collapsed="true">
      <div className="site-sidebar-heading">
      <Brand compact />
      </div>
      <NavigationLinks compact />
    </aside>
    <header className="site-mobile-header design-system">
      <Brand />
      <button className="site-menu-button" type="button" aria-label="打开导航菜单"
        aria-expanded={open} aria-controls="site-menu"
        onClick={() => { dialog.current?.showModal(); setOpen(true); }}>
        <Menu className="ui-icon" aria-hidden="true" />
      </button>
    </header>
    <dialog id="site-menu" ref={dialog} className="site-menu-drawer design-system" aria-label="导航菜单"
      onClose={() => setOpen(false)} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
      }}>
      <div className="site-menu-heading"><span>节奏训练</span>
        <button className="site-menu-button" type="button" aria-label="关闭导航菜单" onClick={() => dialog.current?.close()}>
          <X className="ui-icon" aria-hidden="true" />
        </button>
      </div>
      <NavigationLinks onNavigate={() => dialog.current?.close()} />
    </dialog>
  </>;
}
