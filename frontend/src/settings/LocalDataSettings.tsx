import { useConfirm } from "../ui/confirmation";
import { clearCustomExercises, customExerciseTotalsOptions } from "../api/customExercises";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionError } from "../ui/ActionError";
import { SuccessToast } from "../ui/SuccessToast";
import { AsyncStatus } from "../ui/AsyncStatus";
import { useAssistantPageSection } from "../assistant/assistantContext";
import {
  clearPracticeRecords,
  recordTotalsOptions,
} from "../practice-records/practiceRecordStorage";

export default function LocalDataSettings() {
  const confirm = useConfirm();
  const query = useQuery(customExerciseTotalsOptions());
  const summary = query.data;
  const loadingError = query.error?.message;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [noticeCount, setNoticeCount] = useState(0);
  async function clearLibrary() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await clearCustomExercises();
      setNotice("题库已清空");
      setNoticeCount(x => x + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>本地数据</h2>
      {loadingError && (
        <p role="alert">
          {loadingError}{" "}
          <button onClick={() => void query.refetch()}>重新读取</button>
        </p>
      )}
      <section className="local-data-group">
        <div className="local-data-copy">
          <h3>自定义题库</h3>
          {summary && (
            <p className="local-data-totals">
              {summary.total} 道题目 · 击拍 {summary.tapping} 道 · 听写{" "}
              {summary.dictation} 道
            </p>
          )}
        </div>
        <div className="local-data-actions text-actions">
          <button
            type="button"
            className="local-data-clear"
            disabled={busy || query.isFetching || query.isError || !summary?.total}
            onClick={async () => {
              if (await confirm({ title: "清空题库", description: "全部自定义题目将被删除。", confirmLabel: "清空", danger: true }))
                void clearLibrary();
            }}
          >
            <Trash2 className="ui-icon" aria-hidden="true" />
            清空题库
          </button>
        </div>
      </section>
      <RecordData />
      {error && <ActionError message={error} />}
      {notice && <SuccessToast key={noticeCount} message={notice} />}
    </section>
  );
}

function RecordData() {
  const confirm = useConfirm();
  const query = useQuery(recordTotalsOptions());
  const data = { count: query.data?.recordCount ?? null, attempts: query.data?.attemptCount ?? 0, error: query.error?.message ?? "" };
  const [notice, setNotice] = useState(0);
  useAssistantPageSection("localRecords", {
    status: data.error ? "read-error" : query.isFetching ? "loading" : "ready",
    recordCount: data.count,
    attemptCount: data.error || !query.data ? null : data.attempts,
  });
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const [clearAttempt, setClearAttempt] = useState(0);
  async function clear() {
    if (clearingRef.current) return;
    if (!await confirm({ title: "清空练习记录", description: "全部练习记录将被删除。", confirmLabel: "清空", danger: true }))
      return;
    clearingRef.current = true;
    setClearing(true);
    setError("");
    setClearAttempt((value) => value + 1);
    try {
      await clearPracticeRecords();
      setNotice((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清空失败，请重试");
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  }
  return (
    <section
      className="local-data-group"
      aria-labelledby="local-records-heading"
    >
      <div className="local-data-copy">
        <h3 id="local-records-heading">练习记录</h3>
        <AsyncStatus pending={query.isFetching} label={query.data ? "正在更新记录统计…" : "正在读取练习记录…"} />
        {data.error && <p role="alert">{data.error}</p>}
        {data.count !== null && (
          <p className="local-data-totals">
            {data.count} 条题目记录 <span aria-hidden="true">·</span>{" "}
            {data.attempts} 次尝试
          </p>
        )}
      </div>
      <div className="local-data-actions text-actions">
        <button
          type="button"
          className="local-data-clear"
          disabled={clearing || query.isFetching || !!data.error || data.count === null || data.count === 0}
          onClick={clear}
        >
          <Trash2 className="ui-icon" aria-hidden="true" />
          清空记录
        </button>
        {data.error && (
          <button
            type="button"
            onClick={() => void query.refetch()}
          >
            重新读取记录
          </button>
        )}
      </div>
      {notice > 0 && (
        <SuccessToast key={notice} message="练习记录已清空，自定义题库未修改" />
      )}
      {error && <ActionError key={clearAttempt} message={error} />}
    </section>
  );
}
