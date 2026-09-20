import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import type { PresetQuestion } from "../exercises/presetCatalog";
import { practiceShortcuts, usePracticeShortcuts } from "./usePracticeShortcuts";

/** Caller supplies only this topic and mode; navigation unmounts the keyed audio workspace. */
export function PresetQuestionNavigation({ questions, questionId }: { questions: PresetQuestion[]; questionId: string }) {
  const navigate = useNavigate();
  const index = questions.findIndex(item => item.id === questionId);
  const previous = index > 0 ? () => navigate(`/preset/${questions[index - 1].id}`) : undefined;
  const next = index >= 0 && index < questions.length - 1 ? () => navigate(`/preset/${questions[index + 1].id}`) : undefined;
  // At topic boundaries, shortcuts follow the disabled buttons.
  usePracticeShortcuts({ previous: () => previous?.(), next: () => next?.() });
  return <nav className="preset-question-navigation text-actions" aria-label="切换预设题目">
    <button type="button" disabled={!previous} onClick={previous} title={`上一题（${practiceShortcuts.previous.key}）`} aria-keyshortcuts={practiceShortcuts.previous.key}><ChevronLeft className="ui-icon" aria-hidden="true" />上一题</button>
    <span>{index + 1} / {questions.length}</span>
    <button type="button" disabled={!next} onClick={next} title={`下一题（${practiceShortcuts.next.key}）`} aria-keyshortcuts={practiceShortcuts.next.key}>下一题<ChevronRight className="ui-icon" aria-hidden="true" /></button>
  </nav>;
}
