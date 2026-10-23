import { ArrowRight } from "lucide-react";
import { useAssistantPageContext } from "../assistant/assistantContext";
import { Link } from "react-router";

const entries = [
  { path: "/preset", title: "预设练习", description: "按主题循序练习内置题库", image: "preset" },
  { path: "/random", title: "随机练习", description: "按拍号与范围生成新题", image: "random" },
  { path: "/custom", title: "自定义练习", description: "编写并保存自己的题目", image: "custom" },
  { path: "/records", title: "练习记录", description: "查看历次练习结果", image: "records" },
];

export default function PracticePage() {
  useAssistantPageContext({ page: "practice_hub", description: "练习入口，可选择预设练习、随机练习、自定义练习或查看练习记录。", state: {} });
  return <div className="design-system practice-hub">
    <title>练习 · 节奏训练</title>
    <header className="page-heading"><h1>练习</h1></header>
    <ul className="practice-hub-list">
      {entries.map(({ path, title, description, image }) => <li key={path}>
        <Link className="practice-hub-entry" to={path}>
          <img className="practice-hub-image" src={`/assets/practice/${image}.webp`} alt="" width={120} height={120} />
          <div><h2>{title}</h2><p className="practice-hub-desc">{description}</p></div>
          <ArrowRight className="ui-icon practice-hub-arrow" aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </div>;
}
