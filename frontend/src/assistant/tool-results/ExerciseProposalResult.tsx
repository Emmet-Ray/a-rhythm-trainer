import { useMemo, useState } from "react";
import { Check, ArrowDownToLine } from "lucide-react";
import { ExerciseCard } from "../../exercises/ExerciseCard";
import { parseExerciseProposal } from "./exerciseProposal";
import { useApplyAssistantExercise } from "../assistantContext";

/** 连接助手工具协议与练习展示；通用卡片不读取助手上下文。 */
export function ExerciseProposalResult({ value }: { value: unknown }) {
  const proposal = useMemo(() => {
    try { return parseExerciseProposal(value); } catch { return null; }
  }, [value]);
  const apply = useApplyAssistantExercise();
  const [feedback, setFeedback] = useState<{ target: typeof apply; text: string } | null>(null);
  const notice = feedback?.target === apply ? feedback.text : "";
  if (!proposal) return <p className="assistant-notice" role="status">这份练习的数据无法显示，请让助手重新生成。</p>;
  return <div className="assistant-exercise-result">
    <ExerciseCard title={proposal.title} exercise={proposal.exercise} actions={apply ? <>
      <span role="status">{notice}</span>
      <button type="button" onClick={() => setFeedback({ target: apply, text: apply(proposal) ? "已应用到当前草稿" : "当前无法应用，请稍后重试" })}>
        {notice === "已应用到当前草稿" ? <Check size={16} aria-hidden="true" /> : <ArrowDownToLine size={16} aria-hidden="true" />}应用
      </button>
    </> : undefined} />
  </div>;
}
