import { Link } from "react-router";
import { ArrowRight, FileText, Shuffle, PencilLine } from "lucide-react";

const sources = [
  {
    path: "/preset",
    title: "预设练习",
    description: "按主题循序练习，逐步熟悉不同节奏",
    icon: FileText,
  },
  {
    path: "/random",
    title: "随机练习",
    description: "选择想巩固的节奏，随机出题反复练习",
    icon: Shuffle,
  },
  {
    path: "/custom",
    title: "自定义练习",
    description: "编写自己的节奏题目，保存后随时练习",
    icon: PencilLine,
  },
];

export default function HomePage() {
  return (
    <div className="design-system home-page">
      <title>首页 · 节奏训练</title>
      <nav aria-label="练习入口">
        <ul className="question-list home-sources">
          {sources.map((source) => (
            <li key={source.path}>
              <Link className="question-link" to={source.path}>
                <span className="source-symbol" aria-hidden="true">
                  <source.icon
                    className="ui-icon ui-icon--entry"
                    aria-hidden="true"
                    focusable="false"
                  />
                </span>
                <div>
                  <h2>{source.title}</h2>
                  <p className="question-meta">{source.description}</p>
                </div>
                <span className="question-action">
                  <ArrowRight
                    className="ui-icon"
                    aria-hidden="true"
                    focusable="false"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
