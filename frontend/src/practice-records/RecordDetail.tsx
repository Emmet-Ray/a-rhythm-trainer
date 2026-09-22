import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { DictationAttempt, PracticeRecord } from "./PracticeRecord";
import { tappingPrecisions } from "../settings/tappingPrecision";
import { RecordPagination } from "./RecordPagination";
import { recordPage } from "./practiceRecords";

type ScoreModule = typeof import("../rhythm/notation/RhythmDraftScore");
let loadedScore: ScoreModule | undefined;

/** Only the heavy score is deferred; loading and retry never replace the dialog shell. */
function RecordScorePreview({ record }: { record: PracticeRecord }) {
  const [state, setState] = useState<{ module?: ScoreModule; failed: boolean }>(
    () => ({ module: loadedScore, failed: false }),
  );
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true;
    import("../rhythm/notation/RhythmDraftScore").then(module => {
      loadedScore = module;
      if (active) setState({ module, failed: false });
    }, () => {
      if (active) setState({ failed: true });
    });
    return () => { active = false; };
  }, [request]);
  const Score = state.module?.RhythmDraftScore;
  return <div className="record-score-preview">
    {Score ? <Score measures={record.exercise.measures.map(measure => measure.elements)}
      timeSignature={record.exercise.timeSignature} showNavigation={false} />
      : state.failed ? <div className="record-preview-status">
        <p role="alert">题目预览加载失败，请重试。</p>
        <button type="button" onClick={() => {
          setState({ failed: false });
          setRequest(value => value + 1);
        }}>重试加载</button>
      </div> : <p className="record-preview-status" role="status" aria-busy="true">正在加载题目预览…</p>}
  </div>;
}
const sources = { preset: "预设", random: "随机", custom: "自定义" };
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});
function RecordTime({ value }: { value: string }) {
  const date = new Date(value);
  const label = new Intl.DateTimeFormat("zh-CN", {
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return (
    <time dateTime={value} title={dateFormat.format(date)}>
      {label}
    </time>
  );
}

function recordSummary(record: PracticeRecord) {
  return record.mode === "tapping"
    ? `共 ${record.attempts.length} 次，通过 ${record.attempts.filter((attempt) => attempt.passed).length} 次`
    : `共 ${record.attempts.length} 次，完成 ${record.attempts.filter((attempt) => attempt.completedAt !== null).length} 次`;
}

export function RecordDetail({
  record,
  onClose,
}: {
  record: PracticeRecord;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"attempts" | "score">("attempts");
  const [page, setPage] = useState(1);
  const pagination = recordPage(record.attempts.length, page);
  if (page !== pagination.page) setPage(pagination.page);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="design-system record-drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className="record-detail-heading">
        <div>
          <h2 id={titleId}>{record.title}</h2>
          <p>
            {sources[record.source]} ·{" "}
            {record.mode === "tapping" ? "击拍练习" : "节奏听写"} ·{" "}
            全部历史 · {recordSummary(record)}
          </p>
        </div>
        <div className="text-actions">
          <button type="button" aria-label="关闭记录详情" onClick={onClose}>
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className="record-filters topic-modes"
        role="group"
        aria-label="记录详情视图"
      >
        <button
          type="button"
          aria-pressed={tab === "attempts"}
          onClick={() => setTab("attempts")}
        >
          练习明细
        </button>
        <button
          type="button"
          aria-pressed={tab === "score"}
          onClick={() => setTab("score")}
        >
          题目预览
        </button>
      </div>
      <div className="record-detail">
        {tab === "score" ? (
          <RecordScorePreview record={record} />
        ) : (
          <>
            {record.mode === "tapping" ? (
              <div className="record-table-scroll">
                <table>
                  <caption className="sr-only">击拍练习明细</caption>
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>完成时间</th>
                      <th>速度</th>
                      <th>精度</th>
                      <th>结果</th>
                      <th>命中</th>
                      <th>漏拍</th>
                      <th>误敲</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.attempts
                      .slice(record.attempts.length - pagination.end, record.attempts.length - pagination.start)
                      .reverse()
                      .map((attempt, index) => (
                        <tr key={attempt.id}>
                          <th scope="row">
                            {pagination.start + index + 1}
                          </th>
                          <td>
                            <RecordTime value={attempt.completedAt} />
                          </td>
                          <td>{attempt.bpm} BPM</td>
                          <td
                            title={`精准 ±${attempt.timingWindows.perfectMs} ms，命中 ±${attempt.timingWindows.hitMs} ms`}
                          >
                            {tappingPrecisions.find(
                              (item) =>
                                item.windows.perfectMs ===
                                  attempt.timingWindows.perfectMs &&
                                item.windows.hitMs ===
                                  attempt.timingWindows.hitMs,
                            )?.label ?? `±${attempt.timingWindows.hitMs} ms`}
                          </td>
                          <td
                            data-verdict={
                              attempt.passed ? "correct" : "incorrect"
                            }
                          >
                            {attempt.passed ? "通过" : "未通过"}
                          </td>
                          <td>
                            {attempt.hitCount}/{attempt.targetCount}
                          </td>
                          <td>{attempt.missCount}</td>
                          <td>{attempt.wrongTapCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DictationAttempts attempts={record.attempts} page={pagination.page} />
            )}
            <RecordPagination {...pagination} onChange={setPage} label="练习明细分页" />
          </>
        )}
      </div>
    </dialog>
  );
}

export function DictationAttempts({
  attempts,
  page = 1,
}: {
  attempts: readonly DictationAttempt[];
  page?: number;
}) {
  const pagination = recordPage(attempts.length, page);
  return (
    <div className="record-table-scroll">
      <table>
        <caption className="sr-only">听写练习明细</caption>
        <thead>
          <tr>
            <th>序号</th>
            <th>开始时间</th>
            <th>完成时间</th>
            <th>状态</th>
            <th>查看答案</th>
            <th>小节明细</th>
          </tr>
        </thead>
        <tbody>
          {attempts
            .slice(attempts.length - pagination.end, attempts.length - pagination.start)
            .reverse()
            .map((attempt, index) => (
              <DictationAttemptRow
                key={attempt.id}
                attempt={attempt}
                index={pagination.start + index}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}

function DictationAttemptRow({
  attempt,
  index,
}: {
  attempt: DictationAttempt;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const verdicts = { unchecked: "未验证", correct: "正确", incorrect: "错误" };
  return (
    <>
      <tr>
        <th scope="row">{index + 1}</th>
        <td>
          <RecordTime value={attempt.startedAt} />
        </td>
        <td>
          {attempt.completedAt === null ? (
            "—"
          ) : (
            <RecordTime value={attempt.completedAt} />
          )}
        </td>
        <td
          data-verdict={attempt.completedAt === null ? "unchecked" : "correct"}
        >
          {attempt.completedAt === null ? "未完成" : "已完成"}
        </td>
        <td>{attempt.viewedAnswer ? "已查看" : "未查看"}</td>
        <td className="text-actions">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${open ? "收起" : "查看"}序号 ${index + 1} 的小节明细`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              className="ui-icon record-detail-toggle"
              aria-hidden="true"
            />
            {open ? "收起小节" : "查看小节"}
          </button>
        </td>
      </tr>
      <tr id={detailId} hidden={!open} className="dictation-measure-row">
        <td colSpan={6}>
          {open && (
            <table>
              <caption className="sr-only">
                序号 {index + 1} 的小节明细
              </caption>
              <thead>
                <tr>
                  <th>小节</th>
                  <th>听题次数</th>
                  <th>验证次数</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {attempt.measures.map((measure, measureIndex) => (
                  <tr key={measureIndex}>
                    <th scope="row">小节 {measureIndex + 1}</th>
                    <td>{measure.questionPlayCount} 次</td>
                    <td>{measure.verificationCount} 次</td>
                    <td data-verdict={measure.verdict}>
                      {verdicts[measure.verdict]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </td>
      </tr>
    </>
  );
}
