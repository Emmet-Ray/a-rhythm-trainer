import { useState } from "react";
import { Link, useParams } from "react-router";
import { findPresetQuestion, practiceModes, type PracticeTopic, type PresetQuestion } from "../data/presetExercises";
import RhythmTrainer from "../RhythmTrainer";
import NotFoundPage from "./NotFoundPage";

const MIN_BPM = 40;
const MAX_BPM = 240;

export default function PracticePage() {
  const { questionId } = useParams();
  const selected = findPresetQuestion(questionId ?? "");
  if (!selected) return <NotFoundPage isQuestion />;
  const modeLabel = practiceModes.find((mode) => mode.id === selected.mode)!.label;
  // 未实现的模式不能因为已有题目数据就错误进入击拍组件。
  if (selected.mode !== "tapping") {
    return (
      <section className="page-heading">
        <title>{selected.question.title} · 节奏训练</title>
        <Link className="back-link" to="/">← 返回练习库</Link>
        <p className="eyebrow">{selected.topic.title} / {modeLabel}</p>
        <h1>{selected.question.title}</h1>
        <p>该训练模式尚未开放</p>
      </section>
    );
  }
  // 路由参数变化不一定卸载页面，题目 key 明确结束旧题并重置配置。
  return <PracticeWorkspace key={selected.question.id} topic={selected.topic} question={selected.question} modeLabel={modeLabel} />;
}

function PracticeWorkspace({ topic, question, modeLabel }: { topic: PracticeTopic; question: PresetQuestion; modeLabel: string }) {
  const [bpm, setBpm] = useState(60);
  const [bpmInput, setBpmInput] = useState("60");
  const [hasBpmError, setHasBpmError] = useState(false);
  // 未应用状态由草稿与生效值直接得出，不另存一份状态。
  const hasPendingBpm = Number(bpmInput) !== bpm;

  return (
    <>
      <title>{question.title} · 节奏训练</title>
      <Link className="back-link" to="/">← 返回练习库</Link>
      <header className="page-heading practice-heading">
        <p className="eyebrow">{topic.title} / {modeLabel}</p>
        <h1>{question.title}</h1>
      </header>
      <section className="practice-settings" aria-label="练习设置">
        <form className="tempo-settings" noValidate onSubmit={(event) => {
          event.preventDefault();
          const nextBpm = Number(bpmInput);
          if (!Number.isInteger(nextBpm) || nextBpm < MIN_BPM || nextBpm > MAX_BPM) {
            setHasBpmError(true);
            return;
          }
          setHasBpmError(false);
          setBpm(nextBpm);
          setBpmInput(String(nextBpm));
        }}>
          <label htmlFor="bpm-input">速度 <span className="unit">BPM</span></label>
          <input id="bpm-input" type="number" min={MIN_BPM} max={MAX_BPM} step={1} required
            value={bpmInput} aria-invalid={hasBpmError || undefined}
            aria-describedby={hasBpmError ? "bpm-error" : hasPendingBpm ? "bpm-pending" : undefined}
            onChange={(event) => {
              setBpmInput(event.target.value);
              setHasBpmError(false);
            }} />
          <button type="submit">应用速度</button>
          {hasPendingBpm && !hasBpmError && <span id="bpm-pending" className="bpm-pending">未应用</span>}
          {hasBpmError && <p id="bpm-error" className="bpm-error" role="alert">请输入 {MIN_BPM}–{MAX_BPM} 之间的整数。</p>}
        </form>
      </section>
      <section className="training-workspace" aria-label="击拍训练区">
        {/* 只在生效配置改变时重建训练；编辑草稿、应用相同速度不打断。 */}
        <RhythmTrainer key={`${question.id}:${bpm}`} exercise={question.exercise} bpm={bpm} />
      </section>
    </>
  );
}
