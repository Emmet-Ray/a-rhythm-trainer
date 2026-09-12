import { Link } from "react-router";

const sources = [
  { path: "/preset", title: "预设练习", description: "按节奏主题选择题目。" },
  {
    path: "/random",
    title: "随机练习",
    description: "选择节奏范围，生成练习。",
  },
  {
    path: "/custom",
    title: "自定义练习",
    description: "编写、保存并练习自己的节奏。",
  },
];

export default function HomePage() {
  return (
    <div className="design-system home-page">
      <title>首页 · 节奏训练</title>
      <header className="page-heading">
        <svg className="home-rhythm-mark" width="116" height="64" viewBox="0 0 116 64" aria-hidden="true">
          <path d="M8 46H108" stroke="currentColor" strokeWidth="3" opacity=".18" />
          {[16, 44, 72, 100].map((x, i) => <g key={x}>
            <path d={`M${x + 6} 44V${12 + (i % 2) * 8}`} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <ellipse cx={x} cy="46" rx="9" ry="7" fill="currentColor" />
          </g>)}
        </svg>
        <h1>节奏训练</h1>
      </header>
      <nav aria-label="练习入口">
        <ul className="question-list home-sources">
          {sources.map((source, index) => (
            <li key={source.path}>
              <Link className="question-link" to={source.path}>
                <span className="source-symbol" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    {index === 0 ? <><rect x="7" y="4" width="19" height="24" rx="3" /><path d="M12 11h9M12 17h9M12 23h5" /></>
                      : index === 1 ? <><path d="M4 8h4c8 0 8 16 16 16h4M23 19l5 5-5 4M4 24h4c3 0 5-3 7-7M18 10c2-2 3-2 6-2h4M23 3l5 5-5 5" /></>
                      : <><path d="m8 21-2 6 6-2L27 10l-4-4L8 21ZM19 10l4 4M6 29h21" /></>}
                  </svg>
                </span>
                <div>
                  <h2>{source.title}</h2>
                  <p className="question-meta">{source.description}</p>
                </div>
                <span className="question-action">
                  进入 <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
