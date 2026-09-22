import { useContext, useEffect, useState, type ReactNode } from "react";
import { Check, History } from "lucide-react";
import type { RhythmExercise } from "../rhythm/RhythmModel";
import type { ExerciseContext, PracticeRecord } from "./PracticeRecord";
import { RecordAccessContext } from "./recordAccess";
import { listPracticeRecords, RECORDS_CHANGED } from "./practiceRecordStorage";
import { recordKey, historicalStatus } from "./practiceRecords";
import { RecordDetail } from "./RecordDetail";

function readHistory(key: string) {
  try {
    return { record: listPracticeRecords().find(item => recordKey(item, item.exercise, item.mode) === key), error: "" };
  } catch (error) {
    return { record: undefined, error: error instanceof Error ? error.message : "无法读取练习记录" };
  }
}

export type ExerciseHistoryProps = {
  context: ExerciseContext;
  exercise: RhythmExercise;
  mode: PracticeRecord["mode"];
  /** The heading places status and action separately; storage and dialog remain owned here. */
  children: (slots: { status: ReactNode; action: ReactNode }) => ReactNode;
};
/** Only guest history is read; a new random ID or score version never borrows another record. */
export function ExerciseHistory(props: ExerciseHistoryProps) {
  const access = useContext(RecordAccessContext);
  return access === "guest" ? <LocalHistory key={recordKey(props.context, props.exercise, props.mode)} {...props} /> : props.children({ status: null, action: null });
}

function LocalHistory({ context, exercise, mode, children }: ExerciseHistoryProps) {
  const key = recordKey(context, exercise, mode);
  const [data, setData] = useState(() => readHistory(key));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () => setData(readHistory(key));
    window.addEventListener("storage", refresh);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECORDS_CHANGED, refresh);
    };
  }, [key]);
  const achievement = historicalStatus(data.record);
  const status = achievement ? <span className="practice-achievement"><Check className="ui-icon" aria-hidden="true" />{achievement}</span> : null;
  const action = <div className="exercise-history text-actions">
    {data.error && <span>历史读取失败</span>}
    {data.error ? <button type="button" title={data.error} onClick={() => setData(readHistory(key))}>重试读取</button> :
      <button type="button" disabled={!data.record} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <History className="ui-icon" aria-hidden="true" />练习历史
      </button>}
  </div>;
  return <>{children({ status, action })}
    {open && data.record && <RecordDetail record={data.record} onClose={() => setOpen(false)} />}
  </>;
}
