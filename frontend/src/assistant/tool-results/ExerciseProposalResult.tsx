import { useContext, useMemo, useState } from "react";
import { Check, ArrowDownToLine, Hand } from "lucide-react";
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
  const navigate = useNavigate();
  const location = useLocation();
  const apply = useApplyAssistantExercise();
  const [feedback, setFeedback] = useState<{ target: typeof apply; text: string } | null>(null);
  const notice = feedback?.target === apply ? feedback.text : "";
  if (!proposal) return <p className="assistant-notice" role="status">这份练习的数据无法显示，请让助手重新生成。</p>;
  return <div className="assistant-exercise-result">
    <ExerciseCard title={proposal.title} exercise={proposal.exercise} actions={<>
      <RhythmPlayback key={proposal.id} playbackGroup={playbackGroup} bpm={60}
        timeSignature={proposal.exercise.timeSignature}
        options={[{ id: proposal.id, label: "试听整首", stopLabel: "停止试听", measures: proposal.exercise.measures.map(measure => measure.elements) }]}
        controls={<span>60 BPM</span>} />
      {store && <button type="button" onClick={() => {
        store.add(proposal);
        playbackGroup.stop();
        onPracticeStart();
        navigate(`/ai/tapping/${encodeURIComponent(proposal.id)}`, { state: practiceNavigationState(location) });
      }}><Hand size={16} aria-hidden="true" />进入击拍练习</button>}
      {apply ? <>
      <span role="status">{notice}</span>
      <button type="button" onClick={() => setFeedback({ target: apply, text: apply(proposal) ? "已应用到当前草稿" : "当前无法应用，请稍后重试" })}>
        {notice === "已应用到当前草稿" ? <Check size={16} aria-hidden="true" /> : <ArrowDownToLine size={16} aria-hidden="true" />}应用
      </button>
    </> : null}
    </>} />
  </div>;
}
