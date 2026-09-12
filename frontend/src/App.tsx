import { lazy, Suspense, useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuth } from "./auth/useAuth";
import "./App.css";
import "./design-system.css";

// 首页只展示入口；题库和训练代码进入对应页面后再加载。
// todo: 这个lazy是干嘛的？
const RandomPracticePage = lazy(() => import("./pages/RandomPracticePage"));
const PresetPracticePage = lazy(() => import("./pages/PresetPracticePage"));
const CustomPracticePage = lazy(() => import("./pages/CustomPracticePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));

function App() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 客户端导航没有整页加载，主动把阅读位置与键盘焦点带到新页面。
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="site-header design-system">
        <Link to="/" className="brand">
          节奏训练
        </Link>
        <nav aria-label="主导航">
          <Link to="/" aria-current={pathname === "/" ? "page" : undefined}>首页</Link>
          <PracticeNavigation key={pathname} pathname={pathname} />
          {auth.state.status === "checking" ? (
            <span className="auth-status" role="status">
              正在确认登录…
            </span>
          ) : auth.state.status === "authenticated" ? (
            <>
              <span className="auth-status">已登录</span>
              <button
                className="nav-button"
                disabled={auth.busy}
                onClick={() => void auth.logout()}
              >
                {auth.busy ? "正在退出…" : "退出"}
              </button>
            </>
          ) : (
            <>
              {auth.state.status === "unavailable" ? (
                <>
                  <span className="auth-status" role="status">
                    登录状态暂不可用
                  </span>
                  <button
                    className="nav-button"
                    disabled={auth.busy}
                    onClick={auth.refresh}
                  >
                    重试
                  </button>
                </>
              ) : null}
              <Link
                to="/login"
                aria-current={pathname === "/login" ? "page" : undefined}
              >
                登录
              </Link>
            </>
          )}
        </nav>
      </header>
      {auth.error ? (
        <p role="alert" className="auth-error">
          {auth.error}
        </p>
      ) : null}
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {/* todo: 这个suspense是干嘛的 */}
        <Suspense
          fallback={
            <p className="loading-message" role="status">
              正在加载…
            </p>
          }
        >
          <Routes>
            <Route path="/login" element={<LoginPage auth={auth} />} />
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
        // 只对鼠标启用悬停；触屏仍由 summary 的原生点击行为控制。
        if (event.pointerType === "mouse") event.currentTarget.open = true;
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") event.currentTarget.open = false;
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
      <summary>练习</summary>
      <ul className="practice-navigation-links" aria-label="练习来源">
        {[
          { path: "/preset", label: "预设练习" },
          { path: "/random", label: "随机练习" },
          { path: "/custom", label: "自定义练习" },
        ].map(({ path, label }) => (
          <li key={path}>
            <Link to={path} aria-current={pathname === path ? "page" : pathname.startsWith(`${path}/`) ? "location" : undefined}
              onClick={() => { if (ref.current) ref.current.open = false; }}>{label}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
