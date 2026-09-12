import { lazy, Suspense, useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router";
import PresetPracticePage from "./pages/PresetPracticePage";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuth } from "./auth/useAuth";
import "./App.css";

// 练习库不需要加载乐谱和音频代码，进入练习页时再加载。
// todo: 这个lazy是干嘛的？
const RandomPracticePage = lazy(() => import("./pages/RandomPracticePage"));
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
      <header className="site-header">
        <Link to="/" className="brand">
          节奏训练
        </Link>
        <nav aria-label="主导航">
          <Link to="/" aria-current={pathname === "/" ? "page" : undefined}>
            练习库
          </Link>
          {auth.state.status === "checking" ? <span className="auth-status" role="status">正在确认登录…</span>
            : auth.state.status === "authenticated" ? <>
              <span className="auth-status">已登录</span>
              <button className="nav-button" disabled={auth.busy} onClick={() => void auth.logout()}>
                {auth.busy ? "正在退出…" : "退出"}
              </button>
            </> : <>
              {auth.state.status === "unavailable" ? <>
                <span className="auth-status" role="status">登录状态暂不可用</span>
                <button className="nav-button" disabled={auth.busy} onClick={auth.refresh}>重试</button>
              </> : null}
              <Link to="/login" aria-current={pathname === "/login" ? "page" : undefined}>登录</Link>
            </>}
        </nav>
      </header>
      {auth.error ? <p role="alert" className="auth-error">{auth.error}</p> : null}
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
            <Route path="/" element={<PresetPracticePage />} />
            <Route path="/practice/:questionId" element={<PresetPracticePage />} />
            <Route path="/random" element={<RandomPracticePage />} />
            <Route path="/random/:mode" element={<RandomPracticePage />} />
            <Route path="/custom" element={<CustomPracticePage />} />
            <Route path="/custom/:mode" element={<CustomPracticePage />} />
            <Route path="/custom/:mode/new" element={<CustomPracticePage />} />
            <Route path="/custom/:mode/:exerciseId" element={<CustomPracticePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
