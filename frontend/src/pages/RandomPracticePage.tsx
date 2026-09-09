import { Link, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";

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
        <section aria-label="生成配置">
          <div className="practice-settings">
            <span>生成规则</span>
            <span>基础节奏（固定示例）</span>
            <button type="button" disabled aria-describedby="generation-pending">生成题目</button>
          </div>
          <p id="generation-pending" className="empty-questions">题目生成尚未接入</p>
        </section>
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
        <button type="button" disabled>自定义练习 <small>未开放</small></button>
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
