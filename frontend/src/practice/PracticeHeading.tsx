import { ReturnLink } from "../navigation/PageNavigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ExerciseHistory, type ExerciseHistoryProps } from "../practice-records/ExerciseHistory";

/** 题头承载返回、题名和题目级操作；无上级列表的工作区可省略返回入口。 */
export function PracticeHeading({ backTo, backLabel, title, children, history }: {
  backTo?: string;
  backLabel?: string;
  title?: ReactNode;
  children?: ReactNode;
  history?: Omit<ExerciseHistoryProps, "children">;
}) {
  const render: ExerciseHistoryProps["children"] = ({ status, action }) => (
    <header className="practice-titlebar">
      {backTo && <ReturnLink className="practice-return" to={backTo}><ArrowLeft className="ui-icon" aria-hidden="true" focusable="false" />{backLabel}</ReturnLink>}
      <div className="practice-heading-identity">{title && <h1>{title}</h1>}{status}</div>
      {(children || action) && <div className="practice-heading-actions">{children}{action}</div>}
    </header>
  );
  return history ? <ExerciseHistory {...history}>{render}</ExerciseHistory> : render({ status: null, action: null });
}
