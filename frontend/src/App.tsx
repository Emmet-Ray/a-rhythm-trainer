import { UnsavedChangesScope } from "./navigation/UnsavedChanges";
import { refreshPracticeRecords } from "./practice-records/practiceRecordStorage";
import { PracticeActivity, PracticeActivityContext } from "./assistant/practiceActivity";
import { PlaybackContext, PlaybackGroup } from "./practice/PlaybackGroup";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { routeModules, preloadDestination, preloadLinkIntent } from "./navigation/routeModules";
import { LoadingPlaceholder } from "./navigation/LoadingPlaceholder";
import { Route, Routes, useLocation } from "react-router";
import SiteNavigation from "./navigation/SiteNavigation";
import NotFoundPage from "./pages/NotFoundPage";
import { PageNavigation } from "./navigation/PageNavigation";
import { useNavigationPresentation } from "./navigation/usePageNavigation";
import "./App.css";
import "./design-system.css";
import { GeneratedExerciseStore, GeneratedExercisesContext } from "./exercises/GeneratedExerciseStore";
import { AssistantWorkspace } from "./assistant/AssistantWorkspace";
import { AssistantContext, AssistantContextScope } from "./assistant/assistantContext";

// 题库和训练代码进入对应页面后再加载；助手在路由边界外持续挂载。
const RandomPracticePage = routeModules.random.Component;
const PresetPracticePage = routeModules.preset.Component;
const CustomPracticePage = routeModules.custom.Component;
const SettingsPage = routeModules.settings.Component;
const PracticeRecordsPage = routeModules.records.Component;
const AiPracticePage = routeModules.ai.Component;
const AboutPage = routeModules.about.Component;

function App() {
  const [playback] = useState(() => new PlaybackGroup());
  return <PlaybackContext value={playback}><PageNavigation><UnsavedChangesScope><AppShell /></UnsavedChangesScope></PageNavigation></PlaybackContext>;
}

function AppShell() {
  const { pathname, key } = useLocation();
  useEffect(() => {
    const refresh = () => { void refreshPracticeRecords().catch(() => {}); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [pathname]);
  useEffect(() => { void preloadDestination(pathname); }, [pathname]);
  const mainRef = useRef<HTMLElement>(null);
  const [generatedExercises] = useState(() => new GeneratedExerciseStore());
  // 路由访问隔离上下文快照，助手本身保持挂载
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assistantContext = useMemo(() => new AssistantContext(), [key]);
  const [practiceActivity] = useState(() => new PracticeActivity());
  useNavigationPresentation();

  return (
    <PracticeActivityContext value={practiceActivity}><GeneratedExercisesContext value={generatedExercises}>
    <AssistantContextScope.Provider value={assistantContext}>
    <div className="site-shell" onPointerOver={preloadLinkIntent} onFocusCapture={preloadLinkIntent} onPointerDownCapture={preloadLinkIntent}>
      <a className="skip-link" href={pathname === "/" ? "#assistant" : "#main-content"}>
        跳到主要内容
      </a>
      <SiteNavigation />
      <AssistantWorkspace home={pathname === "/"}>
      <main id="main-content" hidden={pathname === "/"} ref={mainRef} tabIndex={-1} className={pathname === "/" ? "assistant-home-main" : undefined}>
        {/* 按历史记录重挂载以恢复访问快照；预加载缓存不随此 key 重置。 */}
        <Suspense key={key}
          fallback={
            <LoadingPlaceholder />
          }
        >
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/records" element={<PracticeRecordsPage />} />
            <Route path="/about" element={<AboutPage />} />
            {/* 首页内容由下方持续挂载的助手呈现，避免路由切换重建对话。 */}
            <Route path="/" element={null} />
            <Route path="/preset" element={<PresetPracticePage />} />
            <Route
              path="/preset/:questionId"
              element={<PresetPracticePage />}
            />
            <Route path="/ai/dictation/:exerciseId" element={<AiPracticePage mode="dictation" />} />
            <Route path="/ai/tapping/:exerciseId" element={<AiPracticePage mode="tapping" />} />
            <Route path="/random" element={<RandomPracticePage />} />
            <Route path="/random/:mode" element={<RandomPracticePage />} />
            <Route
              path="/custom"
              element={<CustomPracticePage />}
            />
            <Route
              path="/custom/:mode"
              element={<CustomPracticePage />}
            />
            <Route
              path="/custom/:mode/new"
              element={<CustomPracticePage />}
            />
            <Route
              path="/custom/:mode/:exerciseId"
              element={<CustomPracticePage />}
            />
            <Route
              path="/custom/:mode/:exerciseId/edit"
              element={<CustomPracticePage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      </AssistantWorkspace>
    </div>
    </AssistantContextScope.Provider>
    </GeneratedExercisesContext></PracticeActivityContext>
  );
}

export default App;
