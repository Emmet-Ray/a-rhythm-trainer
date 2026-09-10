import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router";
import {
  practiceModes,
  presetTopics,
  findPresetQuestion,
  type PracticeMode,
  type PracticeTopic,
} from "../exercises/presetExercises";
import NotFoundPage from "./NotFoundPage";

// 预设列表不加载训练组件及 VexFlow，进入具体题目后才加载。
const PracticeWorkspace = lazy(() => import("../practice/PracticeWorkspace"));

export default function PresetPracticePage() {
  const { questionId } = useParams();
  if (questionId !== undefined) return <PresetExercisePage questionId={questionId} />;

  return (
    <>
      <title>练习库 · 节奏训练</title>
      <header className="page-heading">
        <h1>练习库</h1>
      </header>
      <div className="option-strip" role="group" aria-label="内容来源">
        <span className="option-current">预设练习</span>
        <Link to="/random">随机练习</Link>
        <Link to="/custom">自定义练习</Link>
      </div>
      <div className="topic-list">
        {presetTopics.map((topic, index) => (
          <TopicQuestions key={topic.id} topic={topic} index={index} />
        ))}
      </div>
    </>
  );
}

function PresetExercisePage({ questionId }: { questionId: string }) {
  const selected = findPresetQuestion(questionId);
  if (!selected) return <NotFoundPage isQuestion />;
  const modeLabel = practiceModes.find(mode => mode.id === selected.mode)!.label;

  return (
    <>
      <title>{selected.question.title} · {modeLabel}</title>
      <Link className="back-link" to="/">← 返回练习库</Link>
      <header className="page-heading practice-heading">
        <p className="eyebrow">{selected.topic.title} / {modeLabel}</p>
        <h1>{selected.question.title}</h1>
      </header>
      {selected.mode === "tapping" || selected.mode === "dictation" ? (
        <Suspense fallback={<p className="loading-message" role="status">正在加载练习…</p>}>
          {/* 路由参数变化不一定卸载页面，题目 key 明确结束旧题并重置配置。 */}
          <PracticeWorkspace key={selected.question.id} exercise={selected.question.exercise} mode={selected.mode} />
        </Suspense>
      ) : <p>该训练模式尚未开放</p>}
    </>
  );
}

// 模式选择属于主题的选题区域，不属于一道题的训练过程。
function TopicQuestions({
  topic,
  index,
}: {
  topic: PracticeTopic;
  index: number;
}) {
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("tapping");
  const questions =
    topic.modes.find((group) => group.mode === selectedMode)?.questions ?? [];

  return (
    <section className="topic-section" aria-labelledby={`topic-${topic.id}`}>
      <header className="topic-heading">
        <span className="topic-number" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 id={`topic-${topic.id}`}>{topic.title}</h2>
      </header>
      <div className="topic-content">
        <div
          className="option-strip topic-modes"
          role="group"
          aria-label={`${topic.title}的训练方式`}
        >
          {practiceModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={
                selectedMode === mode.id ? "option-current" : undefined
              }
              aria-pressed={selectedMode === mode.id}
              aria-controls={`questions-${topic.id}`}
              disabled={!mode.available}
              onClick={() => setSelectedMode(mode.id)}
            >
              {mode.label}
              {!mode.available && <small> 未开放</small>}
            </button>
          ))}
        </div>
        <ul id={`questions-${topic.id}`} className="question-list">
          {questions.map((question) => (
            <li key={question.id}>
              <Link className="question-link" to={`/practice/${question.id}`}>
                <div className="question-copy">
                  <h3>{question.title}</h3>
                </div>
                <span className="question-action">
                  开始练习 <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {questions.length === 0 && <p className="empty-questions">暂无题目</p>}
      </div>
    </section>
  );
}
