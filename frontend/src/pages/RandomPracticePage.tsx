import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { generateExercise, type GenerationConfig } from "../exercises/exerciseGenerator";
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
      <>
        <title>{`随机${selectedMode.label} · 节奏训练`}</title>
        <Link className="back-link" to="/random">← 返回随机练习</Link>
        <header className="page-heading practice-heading">
          <p className="eyebrow">随机练习</p>
          <h1>{selectedMode.label}</h1>
        </header>
        <RandomExerciseWorkspace key={selectedMode.id} mode={selectedMode.id} />
      </>
    );
  }

  return (
    <>
      <title>随机练习 · 节奏训练</title>
      <header className="page-heading"><h1>随机练习</h1></header>
      <nav className="option-strip" aria-label="内容来源">
        <Link to="/">预设练习</Link>
        <Link to="/random" className="option-current" aria-current="page">随机练习</Link>
        <Link to="/custom">自定义练习</Link>
      </nav>
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
          <li className="random-mode-unavailable">几何游戏 <small>未开放</small></li>
        </ul>
      </section>
    </>
  );
}

function RandomExerciseWorkspace({ mode }: { mode: GenerationConfig["mode"] }) {
  const [config, setConfig] = useState<GenerationConfig>({ mode, rule: "basic" });
  const [generated, setGenerated] = useState<{ id: number; exercise: RhythmExercise } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    try {
      // 生成只在事件中执行，不放进渲染或 state updater，避免重复执行。
      const exercise = generateExercise(config);
      setGenerated(previous => ({ id: (previous?.id ?? 0) + 1, exercise }));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
    }
  }

  return (
    <>
      <section aria-label="生成配置">
        <form className="practice-settings" onSubmit={event => { event.preventDefault(); generate(); }}>
          <label htmlFor="generation-rule">生成规则</label>
          <select id="generation-rule" value={config.rule} onChange={event => {
            if (event.target.value === "basic") setConfig(previous => ({ ...previous, rule: "basic" }));
          }}>
            <option value="basic">基础节奏（固定示例）</option>
          </select>
          <button type="submit">{generated ? "重新生成" : "生成题目"}</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
        <Suspense fallback={<p className="loading-message" role="status">正在加载练习…</p>}>
          <PracticeWorkspace exerciseKey={generated?.id ?? 0} exercise={generated?.exercise ?? null} mode={mode} />
        </Suspense>
    </>
  );
}
