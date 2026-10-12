import { RecordDetailContext, type RecordDetailSnapshot } from "./practice-records/recordDetailContext";
import { RecordDetailAssistantContext } from "./assistant/RecordDetailAssistantContext";
import { UnsavedChangesScope } from "./navigation/UnsavedChanges";
import { readExerciseHistory } from "./practice-records/practiceRecordStorage";
import { PracticeActivity, PracticeActivityContext } from "./assistant/practiceActivity";
import { PlaybackContext, PlaybackGroup } from "./practice/PlaybackGroup";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { routeModules, preloadDestination, preloadLinkIntent } from "./navigation/routeModules";
import { LoadingPlaceholder } from "./ui/LoadingPlaceholder";
import { Route, Routes, useLocation } from "react-router";
import SiteNavigation from "./navigation/SiteNavigation";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import { PageNavigation } from "./navigation/PageNavigation";
import { pageMountKey, useNavigationPresentation } from "./navigation/usePageNavigation";
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

function renderRecordDetailContext(snapshot: RecordDetailSnapshot) {
  return <RecordDetailAssistantContext {...snapshot} />;
}

function App() {
  const [playback] = useState(() => new PlaybackGroup());
  return <PlaybackContext value={playback}><PageNavigation><UnsavedChangesScope><AppShell /></UnsavedChangesScope></PageNavigation></PlaybackContext>;
}

function AppShell() {
  const { pathname, key } = useLocation();
  useEffect(() => { void preloadDestination(pathname); }, [pathname]);
  const mainRef = useRef<HTMLElement>(null);
  const [generatedExercises] = useState(() => new GeneratedExerciseStore());
  // 路由访问隔离上下文快照，助手本身保持挂载
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assistantContext = useMemo(() => new AssistantContext(), [key]);
  const [practiceActivity] = useState(() => new PracticeActivity(record => readExerciseHistory(record, record.exercise, record.mode)));
  useNavigationPresentation();

  return (
    <PracticeActivityContext value={practiceActivity}><GeneratedExercisesContext value={generatedExercises}>
    <AssistantContextScope.Provider value={assistantContext}>
    <RecordDetailContext value={renderRecordDetailContext}>
    <div className="site-shell" onPointerOver={preloadLinkIntent} onFocusCapture={preloadLinkIntent} onPointerDownCapture={preloadLinkIntent}>
      <a className="skip-link" href={pathname === "/" ? "#assistant" : "#main-content"}>
        跳到主要内容
      </a>
      <SiteNavigation />
      <AssistantWorkspace home={pathname === "/"}>
      <main id="main-content" hidden={pathname === "/"} ref={mainRef} tabIndex={-1} className={pathname === "/" ? "assistant-home-main" : undefined}>
        {/* 稳定的加载边界让路由过渡保留正文；只重建页面以隔离训练、编辑状态。 */}
        <Suspense
          fallback={
            <LoadingPlaceholder />
          }
        >
          <Routes key={pageMountKey(pathname, key)}>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/records" element={<PracticeRecordsPage />} />
            <Route path="/about" element={<AboutPage />} />
            {/* 首页仅发布页面上下文；对话与欢迎内容由路由外持续挂载的助手呈现。 */}
            <Route path="/" element={<HomePage />} />
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
    </RecordDetailContext>
    </AssistantContextScope.Provider>
    </GeneratedExercisesContext></PracticeActivityContext>
  );
}

export default App;
