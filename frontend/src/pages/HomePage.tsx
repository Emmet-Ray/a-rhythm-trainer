import { Link } from "react-router";
import { ArrowRight, FileText, Shuffle, PencilLine } from "lucide-react";

const sources = [
  { path: "/preset", title: "预设练习", description: "按节奏主题选择题目。", icon: FileText },
  {
    path: "/random",
    title: "随机练习",
    description: "选择节奏范围，生成练习。",
    icon: Shuffle,
  },
  {
    path: "/custom",
    title: "自定义练习",
    description: "编写、保存并练习自己的节奏。",
    icon: PencilLine,
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
          {sources.map((source) => (
            <li key={source.path}>
              <Link className="question-link" to={source.path}>
                <span className="source-symbol" aria-hidden="true">
                  <source.icon className="ui-icon ui-icon--entry" aria-hidden="true" focusable="false" />
                </span>
                <div>
                  <h2>{source.title}</h2>
                  <p className="question-meta">{source.description}</p>
                </div>
                <span className="question-action">
                  进入 <ArrowRight className="ui-icon" aria-hidden="true" focusable="false" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
