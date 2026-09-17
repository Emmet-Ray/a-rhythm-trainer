import { Suspense, useEffect, useRef } from "react";
import { routeModules, preloadDestination, preloadLinkIntent } from "./navigation/routeModules";
import { LoadingPlaceholder } from "./navigation/LoadingPlaceholder";
import { Navigate, Route, Routes, useLocation } from "react-router";
import HomePage from "./pages/HomePage";
import SiteNavigation from "./navigation/SiteNavigation";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuth } from "./auth/useAuth";
import { PageNavigation } from "./navigation/PageNavigation";
import { useNavigationScroll } from "./navigation/usePageNavigation";
import "./App.css";
import "./design-system.css";
import { RecordAccessContext, recordAccess } from "./practice-records/recordAccess";

// 首页只展示入口；题库和训练代码进入对应页面后再加载。
const RandomPracticePage = routeModules.random.Component;
const PresetPracticePage = routeModules.preset.Component;
const CustomPracticePage = routeModules.custom.Component;
const SettingsPage = routeModules.settings.Component;
const PracticeRecordsPage = routeModules.records.Component;
const AboutPage = routeModules.about.Component;

function App() {
  return <PageNavigation><AppShell /></PageNavigation>;
}

function AppShell() {
  const auth = useAuth();
  const { pathname, key } = useLocation();
  useEffect(() => { void preloadDestination(pathname); }, [pathname]);
  const mainRef = useRef<HTMLElement>(null);
  const identity = auth.state.status === "authenticated" ? `account:${auth.state.user.id}` : auth.state.status;
  useNavigationScroll(pathname.startsWith("/custom") ? identity : "public");

  return (
    <RecordAccessContext.Provider value={recordAccess(auth)}><div className="site-shell" onPointerOver={preloadLinkIntent} onFocusCapture={preloadLinkIntent} onPointerDownCapture={preloadLinkIntent}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <SiteNavigation />
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {/* 按历史记录重挂载以恢复访问快照；预加载缓存不随此 key 重置。 */}
        <Suspense key={key}
          fallback={
            <LoadingPlaceholder />
          }
        >
          <Routes>
            <Route path="/login" element={<Navigate to="/settings?category=account" replace />} />
            <Route path="/settings" element={<SettingsPage auth={auth} />} />
            <Route path="/records" element={<PracticeRecordsPage />} />
            <Route path="/about" element={<AboutPage />} />
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
              path="/custom/:mode/:exerciseId/edit"
              element={<CustomPracticePage auth={auth} />}
            />
            <Route
              path="/custom/:mode/account/:exerciseId/edit"
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
    </div></RecordAccessContext.Provider>
  );
}

export default App;
