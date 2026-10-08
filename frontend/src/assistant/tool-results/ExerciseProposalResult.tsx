import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PanelLeft, Hand, Ear, Eye, EyeOff } from "lucide-react";
import { GeneratedExercisesContext } from "../../exercises/GeneratedExerciseStore";
import RhythmPlayback from "../../practice/RhythmPlayback";
import type { PlaybackGroup } from "../../practice/PlaybackGroup";
import { ExerciseCard } from "../../exercises/ExerciseCard";
import { parseGeneratedExercise, type GeneratedExercise } from "../../exercises/GeneratedExercise";
import type { CardState } from "../../api/assistant";
import { useApplyAssistantExercise } from "../assistantContext";

/** 连接助手工具协议与练习展示；通用卡片不读取助手上下文。 */
export function ExerciseProposalResult({ value, playbackGroup, onPracticeStart, savedState, onStateChange }: { savedState?: CardState; onStateChange?: (id: string, value: CardState) => void; value: unknown; playbackGroup: PlaybackGroup; onPracticeStart: (exercise: GeneratedExercise) => void }) {
  const proposal = useMemo(() => {
    try { return parseGeneratedExercise(value); } catch { return null; }
  }, [value]);
  const store = useContext(GeneratedExercisesContext);
  const viewed = useSyncExternalStore(store?.subscribe ?? (() => () => {}),
    () => store?.hasViewedAnswer(proposal?.id ?? "") ?? false);
  useEffect(() => {
    if (proposal && (proposal.mode === "tapping" || savedState?.answer_viewed)) store?.markAnswerViewed(proposal.id);
  }, [store, proposal, savedState?.answer_viewed]);
  // 折叠是本地展示偏好，不撤销已经查看答案的事实。
  const [answerVisibility, setAnswerVisibility] = useState<boolean | null>(null);
  const answerExpanded = answerVisibility ?? (viewed || !!savedState?.answer_viewed);
  const apply = useApplyAssistantExercise();
  // 保留旧会话的速度字段以兼容存储；卡片试听统一使用 60 BPM。
  const bpm = savedState?.bpm ?? 60;
  const lastState = useRef(JSON.stringify({ bpm: savedState?.bpm ?? 60, answer_viewed: savedState?.answer_viewed ?? false }));
  useEffect(() => {
    if (!proposal) return;
    const next = { bpm, answer_viewed: viewed || !!savedState?.answer_viewed };
    const serialized = JSON.stringify(next);
    if (serialized === lastState.current) return;
    lastState.current = serialized;
    onStateChange?.(proposal.id, next);
  }, [proposal, bpm, viewed, savedState?.answer_viewed, onStateChange]);
  if (!proposal) return <p className="assistant-notice" role="status">这份练习的数据无法显示，请让助手重新生成。</p>;
  return <div className="assistant-exercise-result">
    <ExerciseCard title={proposal.title} exercise={proposal.exercise}
      hideScore={proposal.mode === "dictation" && !answerExpanded} actions={<>
      <RhythmPlayback key={proposal.id} playbackGroup={playbackGroup} bpm={60} showStatus={false}
        timeSignature={proposal.exercise.timeSignature}
        options={[{ id: proposal.id, label: "试听", stopLabel: "停止试听", measures: proposal.exercise.measures.map(measure => measure.elements) }]} />
      {proposal.mode === "dictation" && <button className="exercise-apply" type="button" aria-expanded={answerExpanded}
        onClick={() => {
          if (!answerExpanded) store?.markAnswerViewed(proposal.id);
          setAnswerVisibility(!answerExpanded);
        }}>
        {answerExpanded ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        {answerExpanded ? "收起答案" : "查看答案"}
      </button>}
      {store && <button className="exercise-start" type="button" onClick={() => {
        store.add(proposal);
        if (proposal.mode === "tapping") store.markAnswerViewed(proposal.id);
        playbackGroup.stop();
        onPracticeStart(proposal);
      }}>{proposal.mode === "dictation" ? <Ear size={16} aria-hidden="true" /> : <Hand size={16} aria-hidden="true" />}
        {proposal.mode === "dictation" ? "开始听写" : "开始击拍"}
      </button>}
      {apply && <button className="exercise-start" type="button" onClick={() => { const applied = apply(proposal); if (applied) { store?.markAnswerViewed(proposal.id); playbackGroup.stop(); } }}>
        <PanelLeft size={16} aria-hidden="true" />放入编辑器
      </button>}
    </>} />
  </div>;
}
