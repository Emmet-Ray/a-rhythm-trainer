import { Suspense, useEffect, useSyncExternalStore, useLayoutEffect, useRef, type UIEvent } from "react";
import { presetCatalogStore } from "../exercises/presetCatalogStore";
import { workspaceModule } from "../practice/practiceModules";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";
import { ArrowRight } from "lucide-react";
import { PracticeHeading } from "../practice/PracticeHeading";
import { useBrowsingState } from "../navigation/usePageNavigation";
import { Link, useParams } from "react-router";
import {
  practiceModes,
  type PracticeTopic,
  findPresetQuestion,
  type PracticeMode,
} from "../exercises/presetCatalog";
import NotFoundPage from "./NotFoundPage";
import { PresetQuestionNavigation } from "../practice/PresetQuestionNavigation";

// 预设列表不加载训练组件及 VexFlow，进入具体题目后才加载。
const PracticeWorkspace = workspaceModule.Component;

export default function PresetPracticePage() {
  const { questionId } = useParams();
  const state = useSyncExternalStore(presetCatalogStore.subscribe, presetCatalogStore.getSnapshot, presetCatalogStore.getSnapshot);
  useEffect(() => { void presetCatalogStore.load(); }, []);
  if (state.status === "idle" || state.status === "loading") return <LoadingPlaceholder label="正在读取题库…" />;
  if (state.status === "error") return (
    <div className="design-system practice-page">
      <title>题库读取失败 · 节奏训练</title>
      <h1>预设练习</h1>
      <div className="custom-storage-error">
        <p role="alert">{state.message}</p>
        <button type="button" onClick={() => void presetCatalogStore.load(true)}>重新读取题库</button>
      </div>
    </div>
  );
  const presetTopics = state.catalog.topics;
  if (questionId !== undefined) return <PresetExercisePage questionId={questionId} presetTopics={presetTopics} />;
  if (presetTopics.length === 0) return (
    <div className="design-system practice-page">
      <title>预设练习 · 节奏训练</title>
      <h1>预设练习</h1>
      <p role="status">题库暂时没有练习。</p>
    </div>
  );

  return <PresetLibrary presetTopics={presetTopics} />;
}

function PresetLibrary({ presetTopics }: { presetTopics: PracticeTopic[] }) {
  const [selectedMode, setSelectedMode] = useBrowsingState<PracticeMode>("preset:mode", "tapping");
  const [topicId, setTopicId] = useBrowsingState("preset:topic", presetTopics[0].id);
  const topic = presetTopics.find(item => item.id === topicId) ?? presetTopics[0];
  const questions = topic.modes.find(group => group.mode === selectedMode)?.questions ?? [];
  const [topicScrollRef, onTopicScroll] = useListScroll("preset:topic-scroll", "topics");
  const [questionScrollRef, onQuestionScroll] = useListScroll("preset:question-scroll", `${topic.id}:${selectedMode}`);

  return (
    <div className="design-system preset-library">
      <title>预设练习 · 节奏训练</title>
      <header className="page-heading preset-heading">
        <h1>预设练习</h1>
      </header>
      <div className="preset-browser">
        <nav className="preset-topics" aria-label="练习主题" ref={topicScrollRef} onScroll={onTopicScroll} tabIndex={0}>
          {presetTopics.map((item, index) => (
            <button key={item.id} type="button" aria-current={topic.id === item.id ? "true" : undefined}
              aria-controls="preset-questions" onClick={() => setTopicId(item.id)}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span>{item.title}</span>
            </button>
          ))}
        </nav>
        <label className="preset-topic-select">
          <span>练习主题</span>
          <select value={topic.id} onChange={event => setTopicId(event.target.value)}>
            {presetTopics.map((item, index) => (
              <option key={item.id} value={item.id}>{`${String(index + 1).padStart(2, "0")} ${item.title}`}</option>
            ))}
          </select>
        </label>
        <section id="preset-questions" className="preset-questions" aria-labelledby="preset-topic-title">
          <header className="preset-question-heading">
            <h2 id="preset-topic-title">{topic.title}</h2>
            <div className="topic-modes" role="group" aria-label="训练方式">
              {practiceModes.filter(mode => mode.available).map(mode => (
                <button key={mode.id} type="button" aria-pressed={selectedMode === mode.id}
                  aria-controls="preset-question-list" onClick={() => setSelectedMode(mode.id)}>
                  {mode.label}
                </button>
              ))}
            </div>
          </header>
          <section id="preset-question-list" className="preset-question-scroll" aria-label="题目列表"
            ref={questionScrollRef} onScroll={onQuestionScroll} tabIndex={0}>
          <ul className="question-list navigation-list">
            {questions.map(question => (
              <li key={question.id}>
                <Link className="question-link" to={`/preset/${question.id}`}>
                  <div className="question-copy"><h3>{question.title}</h3></div>
                  <span className="question-action">开始练习 <ArrowRight className="ui-icon" aria-hidden="true" focusable="false" /></span>
                </Link>
              </li>
            ))}
          </ul>
          {questions.length === 0 && <p className="empty-questions" role="status">该主题暂时没有{practiceModes.find(mode => mode.id === selectedMode)?.label}题目。</p>}
          </section>
        </section>
      </div>
    </div>
  );
}

/** 新访问继承最近浏览位置；切换内容时归零，历史返回使用原快照。 */
function useListScroll(field: string, content: string) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useBrowsingState(field, { content, top: 0 });
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = position.content === content ? position.top : 0;
  }, [content, position]);
  function onScroll(event: UIEvent<HTMLElement>) {
    const top = event.currentTarget.scrollTop;
    if (position.content !== content || position.top !== top) setPosition({ content, top });
  }
  return [ref, onScroll] as const;
}

function PresetExercisePage({ questionId, presetTopics }: { questionId: string; presetTopics: PracticeTopic[] }) {
  const selected = findPresetQuestion(questionId, presetTopics);
  if (!selected) return <NotFoundPage isQuestion />;
  const modeLabel = practiceModes.find(mode => mode.id === selected.mode)!.label;

  return (
    <div className="design-system practice-page">
      <title>{`${selected.question.title} · ${modeLabel}`}</title>
      <PracticeHeading backTo="/preset" backLabel="预设练习" title={selected.question.title}
        history={(selected.mode === "tapping" || selected.mode === "dictation") ? { context: { source: "preset", exerciseId: questionId, title: selected.question.title }, exercise: selected.question.exercise, mode: selected.mode } : undefined}>
        <PresetQuestionNavigation questionId={questionId} questions={selected.topic.modes.find(group => group.mode === selected.mode)!.questions} />
      </PracticeHeading>
      {selected.mode === "tapping" || selected.mode === "dictation" ? (
        <Suspense fallback={<LoadingPlaceholder workspace label="正在加载练习…" />}>
          {/* 路由参数变化不一定卸载页面，题目 key 明确结束旧题并重置配置。 */}
          <PracticeWorkspace key={selected.question.id} exercise={selected.question.exercise} mode={selected.mode}
            recordContext={{ source: "preset", exerciseId: selected.question.id, title: selected.question.title }} />
        </Suspense>
      ) : <p>该训练模式尚未开放</p>}
    </div>
  );
}
