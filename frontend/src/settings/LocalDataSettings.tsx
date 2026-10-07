import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionError } from "../navigation/ActionError";
import { SuccessToast } from "../navigation/SuccessToast";
import { useAssistantPageSection } from "../assistant/assistantContext";
import {
  clearPracticeRecords,
  refreshPracticeRecords,
  listPracticeRecords,
  RECORDS_CHANGED,
} from "../practice-records/practiceRecordStorage";

async function request(method: "GET" | "DELETE" = "GET") {
  const response = await fetch("/api/local-data/exercises", {
    method,
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.detail || "本地数据服务不可用");
  }
  return response.json();
}
export default function LocalDataSettings() {
  const [summary, setSummary] = useState<{
    total: number;
    tapping: number;
    dictation: number;
  } | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    request()
      .then((summary) => {
        if (active) {
          setSummary(summary);
          setLoadingError("");
        }
      })
      .catch((cause) => {
        if (active) setLoadingError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function run(action: () => Promise<unknown>, message: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      setRevision((x) => x + 1);
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
          <button onClick={() => setRevision((x) => x + 1)}>重新读取</button>
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
            disabled={busy || !summary?.total}
            onClick={() => {
              if (confirm("清空当前实例的自定义题库？此操作无法撤销"))
                void run(() => request("DELETE"), "题库已清空");
            }}
          >
            <Trash2 className="ui-icon" aria-hidden="true" />
            清空题库
          </button>
        </div>
      </section>
      <RecordData />
      {error && <ActionError message={error} />}
      {notice && <SuccessToast key={revision} message={notice} />}
    </section>
  );
}

function readSummary() {
  try {
    const records = listPracticeRecords();
    return {
      count: records.length,
      attempts: records.reduce(
        (sum, record) => sum + record.attempts.length,
        0,
      ),
      error: "",
    };
  } catch (error) {
    return {
      count: null,
      attempts: 0,
      error: error instanceof Error ? error.message : "无法读取练习记录。",
    };
  }
}

function RecordData() {
  const [data, setData] = useState(readSummary);
  const [notice, setNotice] = useState(0);
  useAssistantPageSection("localRecords", {
    status: data.error ? "read-error" : "ready",
    recordCount: data.count,
    attemptCount: data.error ? null : data.attempts,
  });
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const [clearAttempt, setClearAttempt] = useState(0);
  useEffect(() => {
    const refresh = () => setData(readSummary());
    window.addEventListener("storage", refresh);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECORDS_CHANGED, refresh);
    };
  }, []);
  async function clear() {
    if (clearingRef.current) return;
    if (!window.confirm("将删除当前实例的全部练习记录，无法恢复，确定清空吗？"))
      return;
    clearingRef.current = true;
    setClearing(true);
    setError("");
    setClearAttempt((value) => value + 1);
    try {
      await clearPracticeRecords();
      setData(readSummary());
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
        {data.count === null ? (
          <p role="alert">{data.error}</p>
        ) : (
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
          disabled={clearing || data.count === null || data.count === 0}
          onClick={clear}
        >
          <Trash2 className="ui-icon" aria-hidden="true" />
          清空记录
        </button>
        {data.error && (
          <button
            type="button"
            onClick={() => {
              void refreshPracticeRecords().catch(() => {});
            }}
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
