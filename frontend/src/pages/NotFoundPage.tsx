import { Link } from "react-router";

export default function NotFoundPage({
  isQuestion = false,
}: {
  isQuestion?: boolean;
}) {
  const title = isQuestion ? "未找到该练习" : "未找到该页面";
  return (
    <section
      className="design-system not-found"
      aria-labelledby="not-found-heading"
    >
      <title>{`${title} · 节奏训练`}</title>
      <p className="not-found-code">404</p>
      <h1 id="not-found-heading">{title}</h1>
      <Link className="not-found-action" to={isQuestion ? "/preset" : "/"}>
        返回{isQuestion ? "预设练习" : "首页"}
      </Link>
    </section>
  );
}
