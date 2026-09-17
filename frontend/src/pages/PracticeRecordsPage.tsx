import {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ChevronDown, Eye, Trash2, X } from "lucide-react";
import { useVisitState } from "../navigation/usePageNavigation";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";
import { SuccessToast } from "../navigation/SuccessToast";
import type {
  DictationAttempt,
  PracticeRecord,
} from "../practice-records/PracticeRecord";
import {
  deletePracticeRecord,
  listPracticeRecords,
  RECORDS_CHANGED,
} from "../practice-records/practiceRecordStorage";
import {
  RecordAccessContext,
  recordAccessMessage,
} from "../practice-records/recordAccess";
import { tappingPrecisions } from "../settings/tappingPrecision";

const Score = lazy(() =>
  import("../rhythm/notation/RhythmDraftScore").then((module) => ({
    default: module.RhythmDraftScore,
  })),
);
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

function readRecords() {
  try {
    return { records: listPracticeRecords(), error: "" };
  } catch (error) {
    return {
      records: [],
      error: error instanceof Error ? error.message : "无法读取练习记录。",
    };
  }
}

export default function PracticeRecordsPage() {
  const access = useContext(RecordAccessContext);
  return (
    <section className="design-system practice-records-page">
      <title>练习记录 · 节奏训练</title>
      <header className="page-heading">
        <h1>练习记录</h1>
      </header>
      {access === "guest" ? (
        <LocalRecords />
      ) : (
        <p role="status">{recordAccessMessage(access)}</p>
      )}
    </section>
  );
}

type RecordFilter = "all" | "tapping" | "dictation";
function LocalRecords() {
  const [data, setData] = useState(readRecords);
  const [filter, setFilter] = useVisitState<RecordFilter>(
    "record-filter",
    "all",
  );
  const [limit, setLimit] = useVisitState("record-limit", 20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deletedCount, setDeletedCount] = useState(0);
  useEffect(() => {
    const refresh = () => setData(readRecords());
    window.addEventListener("storage", refresh);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECORDS_CHANGED, refresh);
    };
  }, []);
  const filtered = data.records.filter(
    (record) => filter === "all" || record.mode === filter,
  );
  const selected = data.records.find((record) => record.id === selectedId);
  function remove(record: PracticeRecord) {
    if (
      !window.confirm(
        `确定删除“${record.title}”的全部 ${record.attempts.length} 次尝试？此操作无法撤销。`,
      )
    )
      return;
    setActionError("");
    try {
      deletePracticeRecord(record.id);
      setDeletedCount((value) => value + 1);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "删除失败，请重试。",
      );
    }
  }
  if (data.error)
    return (
      <>
        <p role="alert" className="practice-record-error">
          {data.error}
        </p>
        <button type="button" onClick={() => setData(readRecords())}>
          重新读取
        </button>
      </>
    );
  return (
    <>
      {actionError && (
        <p role="alert" className="practice-record-error">
          {actionError}
        </p>
      )}
      <div
        className="record-filters topic-modes"
        role="group"
        aria-label="记录模式"
      >
        {(
          [
            ["all", "全部"],
            ["tapping", "击拍练习"],
            ["dictation", "节奏听写"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setLimit(20);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="records-empty">
          暂无{filter === "all" ? "" : filter === "tapping" ? "击拍" : "听写"}
          练习记录。完成一轮击拍，或开始听题、验证听写后，会自动记录。
        </p>
      ) : (
        <ul className="record-list navigation-list">
          {filtered.slice(0, limit).map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              onOpen={() => setSelectedId(record.id)}
              onDelete={() => remove(record)}
            />
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((value) => value + 20)}>
          加载更多
        </button>
      )}
      {deletedCount > 0 && (
        <SuccessToast key={deletedCount} message="练习记录已删除" />
      )}
      {selected && (
        <RecordDetail
          key={selected.id}
          record={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function recordSummary(record: PracticeRecord) {
  return record.mode === "tapping"
    ? `共 ${record.attempts.length} 次，通过 ${record.attempts.filter((attempt) => attempt.passed).length} 次`
    : `共 ${record.attempts.length} 次，完成 ${record.attempts.filter((attempt) => attempt.completedAt !== null).length} 次`;
}

function RecordRow({
  record,
  onOpen,
  onDelete,
}: {
  record: PracticeRecord;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="record-entry">
      <div className="record-entry-content">
        <h2>{record.title}</h2>
        <p>
          {sources[record.source]} ·{" "}
          {record.mode === "tapping" ? "击拍练习" : "节奏听写"}
        </p>
      </div>
      <div className="record-entry-actions text-actions">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`查看详情：“${record.title}”的练习记录`}
          onClick={onOpen}
        >
          <Eye className="ui-icon" aria-hidden="true" />
          查看详情
        </button>
        <button
          type="button"
          className="local-data-clear"
          aria-label={`删除“${record.title}”的练习记录`}
          onClick={onDelete}
        >
          <Trash2 className="ui-icon" aria-hidden="true" />
          删除
        </button>
      </div>
    </li>
  );
}

export function RecordDetail({
  record,
  onClose,
}: {
  record: PracticeRecord;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"attempts" | "score">("attempts");
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
            {recordSummary(record)}
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
          尝试记录
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
          <div className="record-score-preview">
            <Suspense fallback={<LoadingPlaceholder />}>
              <Score
                measures={record.exercise.measures.map(
                  (measure) => measure.elements,
                )}
                timeSignature={record.exercise.timeSignature}
                showNavigation={false}
              />
            </Suspense>
          </div>
        ) : (
          <>
            {record.mode === "tapping" ? (
              <div className="record-table-scroll">
                <table>
                  <caption className="sr-only">击拍尝试明细</caption>
                  <thead>
                    <tr>
                      <th>尝试</th>
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
                      .slice()
                      .reverse()
                      .map((attempt, index) => (
                        <tr key={attempt.id}>
                          <th scope="row">
                            第 {record.attempts.length - index} 次
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
              <DictationAttempts attempts={record.attempts} />
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

export function DictationAttempts({
  attempts,
}: {
  attempts: readonly DictationAttempt[];
}) {
  return (
    <div className="record-table-scroll">
      <table>
        <caption className="sr-only">听写尝试明细</caption>
        <thead>
          <tr>
            <th>尝试</th>
            <th>开始时间</th>
            <th>完成时间</th>
            <th>状态</th>
            <th>查看答案</th>
            <th>小节明细</th>
          </tr>
        </thead>
        <tbody>
          {attempts
            .slice()
            .reverse()
            .map((attempt, index) => (
              <DictationAttemptRow
                key={attempt.id}
                attempt={attempt}
                index={attempts.length - index - 1}
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
        <th scope="row">第 {index + 1} 次</th>
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
            aria-label={`${open ? "收起" : "查看"}第 ${index + 1} 次尝试的小节明细`}
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
                第 {index + 1} 次听写的小节明细
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
