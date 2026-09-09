import { Link } from "react-router";

export default function NotFoundPage({ isQuestion = false }: { isQuestion?: boolean }) {
  const title = isQuestion ? "未找到该练习" : "未找到该页面";
  return (
    <section className="page-heading not-found">
      <title>{`${title} · 节奏训练`}</title>
      <p className="eyebrow">404</p>
      <h1>{title}</h1>
      <p>请检查地址，或返回练习库选择一道题目。</p>
      <Link className="back-link" to="/">← 返回练习库</Link>
    </section>
  );
}
