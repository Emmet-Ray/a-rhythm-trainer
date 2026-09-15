import { lazy, Suspense, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import HomePage from "./pages/HomePage";
import SiteNavigation from "./navigation/SiteNavigation";
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
      <SiteNavigation />
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
