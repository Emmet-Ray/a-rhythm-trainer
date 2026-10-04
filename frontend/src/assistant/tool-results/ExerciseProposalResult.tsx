import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PanelLeft, Hand, Ear, Minus, Plus } from "lucide-react";
import { practiceNavigationState } from "../../exercises/aiPracticeNavigation";
import { useLocation, useNavigate } from "react-router";
import { GeneratedExercisesContext } from "../../exercises/GeneratedExerciseStore";
import RhythmPlayback from "../../practice/RhythmPlayback";
import type { PlaybackGroup } from "../../practice/PlaybackGroup";
import { ExerciseCard } from "../../exercises/ExerciseCard";
import { parseGeneratedExercise } from "../../exercises/GeneratedExercise";
import { useApplyAssistantExercise } from "../assistantContext";

/** 连接助手工具协议与练习展示；通用卡片不读取助手上下文。 */
export function ExerciseProposalResult({ value, playbackGroup, onPracticeStart }: { value: unknown; playbackGroup: PlaybackGroup; onPracticeStart: () => void }) {
  const proposal = useMemo(() => {
    try { return parseGeneratedExercise(value); } catch { return null; }
  }, [value]);
  const store = useContext(GeneratedExercisesContext);
  const viewed = useSyncExternalStore(store?.subscribe ?? (() => () => {}),
    () => store?.hasViewedAnswer(proposal?.id ?? "") ?? false);
  useEffect(() => {
    if (proposal?.mode === "tapping") store?.markAnswerViewed(proposal.id);
  }, [store, proposal]);
  const navigate = useNavigate();
  const location = useLocation();
  const apply = useApplyAssistantExercise();
  const [bpm, setBpm] = useState(60);
  const [bpmInput, setBpmInput] = useState("60");
  const typedBpm = Number(bpmInput);
  const stepBpm = bpmInput.trim() && Number.isInteger(typedBpm) && typedBpm >= 40 && typedBpm <= 240 ? typedBpm : bpm;
  function adjustBpm(delta: number) {
    const next = Math.max(40, Math.min(240, stepBpm + delta));
    setBpm(next); setBpmInput(String(next));
  }
  const [feedback, setFeedback] = useState<{ target: typeof apply; text: string } | null>(null);
  const notice = feedback?.target === apply ? feedback.text : "";
  if (!proposal) return <p className="assistant-notice" role="status">这份练习的数据无法显示，请让助手重新生成。</p>;
  return <div className="assistant-exercise-result">
    <ExerciseCard title={proposal.title} exercise={proposal.exercise}
      status={proposal.mode === "dictation" && viewed ? <span className="exercise-answer-viewed" role="status">已查看答案</span> : undefined}
      controls={<div className="exercise-tempo" role="group" aria-label="试听速度">
        <button type="button" aria-label="减慢 5 BPM" disabled={stepBpm <= 40} onClick={() => adjustBpm(-5)}><Minus size={14} aria-hidden="true" /></button>
        <label className="exercise-tempo-value">
        <input type="number" aria-label="试听速度 BPM" min={40} max={240} step={1} required value={bpmInput}
          onChange={event => setBpmInput(event.target.value)}
          onBlur={event => {
            if (event.currentTarget.validity.valid) {
              const next = Number(event.currentTarget.value);
              setBpm(next); setBpmInput(String(next));
            } else setBpmInput(String(bpm));
          }}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.currentTarget.reportValidity()) event.currentTarget.blur();
            }
          }} />
        <span>BPM</span>
        </label>
        <button type="button" aria-label="加快 5 BPM" disabled={stepBpm >= 240} onClick={() => adjustBpm(5)}><Plus size={14} aria-hidden="true" /></button>
      </div>}
      hiddenSummary={proposal.mode === "dictation" && !viewed ? <span className="exercise-hidden-summary">
        {proposal.exercise.measures.length} 小节 · 答案已隐藏
      </span> : undefined} actions={<>
      <RhythmPlayback key={`${proposal.id}:${bpm}`} playbackGroup={playbackGroup} bpm={bpm} showStatus={false}
        timeSignature={proposal.exercise.timeSignature}
        options={[{ id: proposal.id, label: "试听", stopLabel: "停止试听", measures: proposal.exercise.measures.map(measure => measure.elements) }]} />
      {proposal.mode === "dictation" && !viewed && <button className="exercise-apply" type="button" onClick={() => store?.markAnswerViewed(proposal.id)}>查看答案</button>}
      {store && <button className="exercise-start" type="button" onClick={() => {
        store.add(proposal);
        if (proposal.mode === "tapping") store.markAnswerViewed(proposal.id);
        playbackGroup.stop();
        onPracticeStart();
        navigate(`/ai/${proposal.mode}/${encodeURIComponent(proposal.id)}`, { state: practiceNavigationState(location) });
      }}>{proposal.mode === "dictation" ? <Ear size={16} aria-hidden="true" /> : <Hand size={16} aria-hidden="true" />}
        {proposal.mode === "dictation" ? "开始听写" : "开始击拍"}
      </button>}
      {apply ? <>
      {notice && <span className="exercise-apply-feedback" role="status">{notice}</span>}
      <button className="exercise-start" type="button" onClick={() => { const applied = apply(proposal); if (applied) { store?.markAnswerViewed(proposal.id); playbackGroup.stop(); } setFeedback({ target: apply, text: applied ? "" : "暂时无法放入编辑器，请稍后重试" }); }}>
        <PanelLeft size={16} aria-hidden="true" />放入编辑器
      </button>
    </> : null}
    </>} />
  </div>;
}
