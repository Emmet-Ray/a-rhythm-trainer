import { Link, useParams } from "react-router";
import { findPresetQuestion, practiceModes } from "../data/presetExercises";
import PracticeWorkspace from "../PracticeWorkspace";
import NotFoundPage from "./NotFoundPage";

export default function PracticePage() {
  const { questionId } = useParams();
  const selected = findPresetQuestion(questionId ?? "");
  if (!selected) return <NotFoundPage isQuestion />;
  const modeLabel = practiceModes.find(mode => mode.id === selected.mode)!.label;

  return (
    <>
      <title>{selected.question.title} · {modeLabel}</title>
      <Link className="back-link" to="/">← 返回练习库</Link>
      <header className="page-heading practice-heading">
        <p className="eyebrow">{selected.topic.title} / {modeLabel}</p>
        <h1>{selected.question.title}</h1>
      </header>
      {selected.mode === "tapping" || selected.mode === "dictation" ? (
        // 路由参数变化不一定卸载页面，题目 key 明确结束旧题并重置配置。
        <PracticeWorkspace key={selected.question.id} exercise={selected.question.exercise} mode={selected.mode} />
      ) : (
        <p>该训练模式尚未开放</p>
      )}
    </>
  );
}
