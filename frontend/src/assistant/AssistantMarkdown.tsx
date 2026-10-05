import { memo } from "react";
import Markdown, { type Components } from "react-markdown";

const components: Components = {
  // 回复标题从三级开始，不与页面标题和助手标题争夺层级。
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
};

/** 流式与已完成回复共用基础 Markdown；不执行 HTML、不加载模型提供的图片。 */
export const AssistantMarkdown = memo(function AssistantMarkdown({ text }: { text: string }) {
  return <div className="assistant-message-text assistant-markdown">
    <Markdown skipHtml components={components}>{text}</Markdown>
  </div>;
});
