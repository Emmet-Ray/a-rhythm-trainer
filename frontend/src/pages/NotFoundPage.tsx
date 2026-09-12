import { Link } from "react-router";

export default function NotFoundPage({ isQuestion = false }: { isQuestion?: boolean }) {
  const title = isQuestion ? "未找到该练习" : "未找到该页面";
  return (
    <section className="page-heading not-found">
      <title>{`${title} · 节奏训练`}</title>
      <p className="eyebrow">404</p>
      <h1>{title}</h1>
      <p>请检查地址，或返回{isQuestion ? "预设练习选择题目" : "首页选择练习入口"}。</p>
      <Link className="back-link" to={isQuestion ? "/preset" : "/"}>← 返回{isQuestion ? "预设练习" : "首页"}</Link>
    </section>
  );
}
