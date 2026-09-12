import { lazy, Suspense, useId, useState } from "react";
import { Link, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { generateRandomExercise, randomTopics, randomMeasureCounts, DEFAULT_RANDOM_MEASURE_COUNT, type RandomGenerationConfig } from "../exercises/randomExercises";
import type { RhythmExercise } from "../rhythm/RhythmModel";

// 进入对应模式后加载完整工作区，尚未生成时显示空状态。
const PracticeWorkspace = lazy(() => import("../practice/PracticeWorkspace"));

// 随机练习的开放范围独立于预设题库；这里只列出已有子页面的模式。
const randomModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;

export default function RandomPracticePage() {
  const { mode } = useParams();
  const selectedMode = randomModes.find(item => item.id === mode);
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (selectedMode) {
    return (
      <div className="random-page">
        <title>{`随机${selectedMode.label} · 节奏训练`}</title>
        <div className="design-system practice-page">
        <Link className="back-link" to="/random">← 返回随机练习</Link>
        <header className="page-heading practice-heading">
          <p className="eyebrow">随机练习</p>
          <h1>{selectedMode.label}</h1>
        </header>
        </div>
        <RandomExerciseWorkspace key={selectedMode.id} mode={selectedMode.id} />
      </div>
    );
  }

  return (
    <div className="design-system random-page random-index">
      <title>随机练习 · 节奏训练</title>
      <header className="page-heading"><h1>随机练习</h1></header>
      <section className="random-mode-selection" aria-labelledby="random-mode-heading">
        <h2 id="random-mode-heading">选择训练方式</h2>
        <ul className="question-list">
          {randomModes.map(item => (
            <li key={item.id}>
              <Link className="question-link" to={`/random/${item.id}`}>
                <h3>{item.label}</h3>
                <span className="question-action">配置规则 <span aria-hidden="true">→</span></span>
              </Link>
            </li>
          ))}
          <li>
            <div className="question-link random-mode-unavailable" aria-disabled="true">
              <h3>几何游戏</h3>
              <span className="question-action">未开放</span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

function RandomExerciseWorkspace({ mode }: { mode: RandomGenerationConfig["mode"] }) {
  const measureCountName = useId();
  const [config, setConfig] = useState<RandomGenerationConfig>({ mode, topics: ["basic-notes"], measureCount: DEFAULT_RANDOM_MEASURE_COUNT });
  const [generated, setGenerated] = useState<{ id: number; exercise: RhythmExercise } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    try {
      // 生成只在事件中执行，不放进渲染或 state updater，避免重复执行。
      const exercise = generateRandomExercise(config);
      setGenerated(previous => ({ id: (previous?.id ?? 0) + 1, exercise }));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
    }
  }

  return (
    <>
      <section className="design-system random-generation" aria-label="生成配置">
        <form className="random-config" onSubmit={event => { event.preventDefault(); generate(); }}>
          <fieldset className="random-topics">
            <legend>练习范围</legend>
            {randomTopics.map(topic => (
              <label key={topic.id}>
                <input type="checkbox" checked={config.topics.includes(topic.id)} onChange={event => {
                  const checked = event.target.checked;
                  setConfig(previous => ({ ...previous, topics: checked
                    ? [...previous.topics, topic.id]
                    : previous.topics.filter(id => id !== topic.id) }));
                  setError(null);
                }} />
                {topic.label}
              </label>
            ))}
          </fieldset>
          <div className="random-generation-actions">
            <fieldset className="measure-count">
              <legend>小节数</legend>
              <div className="measure-count-options">
                {randomMeasureCounts.map(count => (
                  <label key={count}>
                    <input type="radio" name={measureCountName} value={count}
                      checked={config.measureCount === count}
                      onChange={() => {
                        setConfig(previous => ({ ...previous, measureCount: count }));
                        setError(null);
                      }} />
                    <span>{count} 小节</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="generate-button" type="submit">{generated ? "重新生成" : "生成题目"}</button>
          </div>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
        <Suspense fallback={<p className="loading-message" role="status">正在加载练习…</p>}>
          <PracticeWorkspace exerciseKey={generated?.id ?? 0} exercise={generated?.exercise ?? null} mode={mode} />
        </Suspense>
    </>
  );
}
