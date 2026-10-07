import { useState, type ReactNode } from "react";
import { Check, History } from "lucide-react";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import type { ExerciseContext, PracticeRecord } from "./PracticeRecord";
import { queryExerciseHistory, useRecordQuery, summaryAchievement } from "./practiceRecordStorage";
import { recordKey } from "./practiceRecords";
import { StoredRecordDetail } from "./RecordDetail";

export type ExerciseHistoryProps = {
  context: ExerciseContext;
  exercise: RhythmExercise;
  mode: PracticeRecord["mode"];
  /** The heading places status and action separately; storage and dialog remain owned here. */
  children: (slots: { status: ReactNode; action: ReactNode }) => ReactNode;
};
/** Instance history is read; a new random ID or score version never borrows another record. */
export function ExerciseHistory(props: ExerciseHistoryProps) {
  return <LocalHistory key={recordKey(props.context, props.exercise, props.mode)} {...props} />;
}

function LocalHistory({ context, exercise, mode, children }: ExerciseHistoryProps) {
  const key = recordKey(context, exercise, mode);
  const query = useRecordQuery(key, () => queryExerciseHistory({ source: context.source, exerciseId: context.exerciseId, exercise, mode }));
  const data = { record: query.data?.record, error: query.error };
  const [open, setOpen] = useState(false);
  const achievement = summaryAchievement(data.record);
  const status = achievement ? <span className="practice-achievement"><Check className="ui-icon" aria-hidden="true" />{achievement}</span> : null;
  const action = <div className="exercise-history text-actions">
    {data.error && <span>历史读取失败</span>}
    {data.error ? <button type="button" title={data.error} onClick={query.reload}>重试读取</button> :
      <button type="button" disabled={!data.record} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <History className="ui-icon" aria-hidden="true" />练习历史
      </button>}
  </div>;
  return <>{children({ status, action })}
    {open && data.record && <StoredRecordDetail record={data.record} onClose={() => setOpen(false)} />}
  </>;
}
