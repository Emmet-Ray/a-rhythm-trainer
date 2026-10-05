import { useAssistantPageContext } from "../assistant/assistantContext";

const sources = [
  { path: "/preset", title: "预设练习" },
  { path: "/random", title: "随机练习" },
  { path: "/custom", title: "自定义练习" },
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
