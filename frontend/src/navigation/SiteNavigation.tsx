import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { House, FileText, Shuffle, PencilLine, Settings, Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import BrandMark from "../brand/BrandMark";

const destinations = [
  { path: "/", label: "首页", icon: House },
  { path: "/preset", label: "预设练习", icon: FileText },
  { path: "/random", label: "随机练习", icon: Shuffle },
  { path: "/custom", label: "自定义练习", icon: PencilLine },
  { path: "/settings", label: "设置", icon: Settings },
];

function NavigationLinks({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { pathname } = useLocation();
  return <nav className="site-navigation" aria-label="主导航">
    {destinations.map(({ path, label, icon: Icon }) => <Link key={path} to={path}
      className={path === "/settings" ? "site-settings-link" : undefined}
      aria-current={pathname === path ? "page" : path !== "/" && pathname.startsWith(`${path}/`) ? "location" : undefined}
      title={compact ? label : undefined} aria-label={compact ? label : undefined}
      onClick={onNavigate}><Icon className="ui-icon" aria-hidden="true" focusable="false" />{!compact && label}</Link>)}
  </nav>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="brand" aria-label={compact ? "节奏训练首页" : undefined} title={compact ? "节奏训练首页" : undefined}><BrandMark className="brand-mark" />{!compact && "节奏训练"}</Link>;
}

const collapsedStorageKey = "rhythm-trainer.sidebar-collapsed";

/** 桌面固定导航与移动端模态菜单共用入口；关闭抽屉后交还浏览器焦点。 */
export default function SiteNavigation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapsedStorageKey) === "true"; }
    catch { return false; }
  });
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    // 存储不可用时仍可在本次会话中折叠，不影响导航。
    try { localStorage.setItem(collapsedStorageKey, String(next)); } catch { /* Session-only preference. */ }
  };
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
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return <>
    <aside className="site-sidebar design-system" data-collapsed={collapsed}>
      <Brand compact={collapsed} /><NavigationLinks compact={collapsed} />
      <button type="button" className="site-sidebar-toggle" onClick={toggleSidebar}
        aria-label={collapsed ? "展开导航" : "收起导航"} aria-expanded={!collapsed}
        title={collapsed ? "展开导航" : "收起导航"}>
        {collapsed ? <PanelLeftOpen className="ui-icon" aria-hidden="true" /> : <PanelLeftClose className="ui-icon" aria-hidden="true" />}
        {!collapsed && "收起导航"}
      </button>
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
