import { ArrowUpRight, Mail } from "lucide-react";

export default function AboutPage() {
  return <section className="design-system about-page">
    <title>关于 · 节奏训练</title>
    <header className="page-heading"><h1>关于</h1></header>
    <div className="about-content">
      <ul className="navigation-list about-links">
        <li><a className="about-link" href="https://github.com/Emmet-Ray/a-rhythm-trainer" target="_blank" rel="noopener noreferrer">
          <svg className="ui-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.931 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 3.003-.404c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.625-5.479 5.922.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.595 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span><strong>GitHub</strong><span>Emmet-Ray / a-rhythm-trainer</span></span>
          <ArrowUpRight className="ui-icon" aria-hidden="true" />
          <span className="sr-only">（在新标签页打开）</span>
        </a></li>
        <li><a className="about-link" href="mailto:mengtaoli@bupt.edu.cn">
          <Mail className="ui-icon" aria-hidden="true" />
          <span><strong>联系邮箱</strong><span>mengtaoli@bupt.edu.cn</span></span>
          <ArrowUpRight className="ui-icon" aria-hidden="true" />
        </a></li>
      </ul>
    </div>
  </section>;
}
