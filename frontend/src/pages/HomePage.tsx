import { Link } from "react-router";
import { FileText, Shuffle, PencilLine } from "lucide-react";
import { useAssistantPageContext } from "../assistant/assistantContext";

const sources = [
  { path: "/preset", title: "预设练习", icon: FileText },
  { path: "/random", title: "随机练习", icon: Shuffle },
  { path: "/custom", title: "自定义练习", icon: PencilLine },
];

/** 首页提供引导与页面资料；对话本身由路由外的助手持续持有。 */
export default function HomePage({ started }: { started: boolean }) {
  useAssistantPageContext({ page: "home", description: "节奏训练首页，通过对话生成练习，或选择已有练习来源。",
    state: { practiceSources: sources.map(({ path, title }) => ({ path, title })) } });
  return <>
    <title>首页 · 节奏训练</title>
    {!started && <div className="assistant-home-welcome">
      <h1>今天想练什么节奏？</h1>
    </div>}
  </>;
}

export function HomeSuggestions({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return <div className="assistant-suggestions" aria-label="示例问题">
    <button type="button" onClick={() => onSuggestion("给我一道两小节的入门击拍练习")}>两小节入门击拍</button>
    <button type="button" onClick={() => onSuggestion("给我出一道两小节的节奏听写题")}>出一道听写题</button>
  </div>;
}

export function HomePracticeLinks() {
  return <nav className="assistant-home-sources" aria-label="练习入口">
    {sources.map(({ path, title, icon: Icon }) => <Link key={path} to={path}><Icon size={15} aria-hidden="true" />{title}</Link>)}
  </nav>;
}
