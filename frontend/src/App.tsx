import { lazy, Suspense, useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import HomePage from "./pages/HomePage";
import BrandMark from "./brand/BrandMark";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuth } from "./auth/useAuth";
import { PageNavigation } from "./navigation/PageNavigation";
import { useNavigationScroll } from "./navigation/usePageNavigation";
import "./App.css";
import "./design-system.css";

// 首页只展示入口；题库和训练代码进入对应页面后再加载。
// todo: 这个lazy是干嘛的？
const RandomPracticePage = lazy(() => import("./pages/RandomPracticePage"));
const PresetPracticePage = lazy(() => import("./pages/PresetPracticePage"));
const CustomPracticePage = lazy(() => import("./pages/CustomPracticePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function App() {
  return <PageNavigation><AppShell /></PageNavigation>;
}

function AppShell() {
  const auth = useAuth();
  const { pathname, key } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const identity = auth.state.status === "authenticated" ? `account:${auth.state.user.id}` : auth.state.status;
  useNavigationScroll(pathname.startsWith("/custom") ? identity : "public");

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header design-system">
        <Link to="/" className="brand">
          <BrandMark className="brand-mark" />
          节奏训练
        </Link>
        <nav aria-label="主导航">
          <Link to="/" aria-current={pathname === "/" ? "page" : undefined}>首页</Link>
          <PracticeNavigation key={pathname} pathname={pathname} />
          <Link to="/settings" aria-current={pathname === "/settings" ? "page" : undefined}>设置</Link>
        </nav>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {/* todo: 这个suspense是干嘛的 */}
        <Suspense key={key}
          fallback={
            <p className="loading-message" role="status" data-navigation-pending>
              正在加载…
            </p>
          }
        >
          <Routes>
            <Route path="/login" element={<Navigate to="/settings?category=account" replace />} />
            <Route path="/settings" element={<SettingsPage auth={auth} />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/preset" element={<PresetPracticePage />} />
            <Route
              path="/preset/:questionId"
              element={<PresetPracticePage />}
            />
            <Route path="/random" element={<RandomPracticePage />} />
            <Route path="/random/:mode" element={<RandomPracticePage />} />
            <Route
              path="/custom"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route
              path="/custom/:mode"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route
              path="/custom/:mode/new"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route
              path="/custom/:mode/:exerciseId"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route
              path="/custom/:mode/account/:exerciseId"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;

function PracticeNavigation({ pathname }: { pathname: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const mouseInside = useRef(false);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) ref.current.open = false;
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details className="practice-navigation" ref={ref}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          mouseInside.current = true;
          event.currentTarget.open = true;
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          mouseInside.current = false;
          event.currentTarget.open = false;
        }
      }}
      onPointerDown={(event) => {
        mouseInside.current = event.pointerType === "mouse";
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
      <summary onClick={(event) => {
        // 鼠标悬停已展开时，点击不反向关闭；键盘和触屏保留原生切换。
        if (event.detail > 0 && mouseInside.current && ref.current?.open) event.preventDefault();
      }}>练习<ChevronDown className="ui-icon practice-navigation-chevron" aria-hidden="true" focusable="false" /></summary>
      <ul className="practice-navigation-links" aria-label="练习来源">
        {[
          { path: "/preset", label: "预设练习" },
          { path: "/random", label: "随机练习" },
          { path: "/custom", label: "自定义练习" },
        ].map(({ path, label }) => (
          <li key={path}>
            <Link to={path} aria-current={pathname === path ? "page" : pathname.startsWith(`${path}/`) ? "location" : undefined}
              onClick={() => { if (ref.current) ref.current.open = false; }}>{label}
              {(pathname === path || pathname.startsWith(`${path}/`)) && <Check className="ui-icon" aria-hidden="true" focusable="false" />}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
