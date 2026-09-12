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
    <>
      <title>首页 · 节奏训练</title>
      <header className="page-heading">
        <h1>节奏训练</h1>
      </header>
      <nav aria-label="练习入口">
        <ul className="question-list home-sources">
          {sources.map((source) => (
            <li key={source.path}>
              <Link className="question-link" to={source.path}>
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
    </>
  );
}
