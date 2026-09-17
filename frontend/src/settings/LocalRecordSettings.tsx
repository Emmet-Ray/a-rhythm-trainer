import { useContext, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { SuccessToast } from "../navigation/SuccessToast";
import {
  RecordAccessContext,
  recordAccessMessage,
} from "../practice-records/recordAccess";
import {
  clearPracticeRecords,
  listPracticeRecords,
  RECORDS_CHANGED,
} from "../practice-records/practiceRecordStorage";

export default function LocalRecordSettings() {
  const access = useContext(RecordAccessContext);
  return (
    <section
      className="local-data-group"
      aria-labelledby="local-records-heading"
    >
      {access === "guest" ? (
        <RecordData />
      ) : (
        <div className="local-data-copy">
          <h3 id="local-records-heading">练习记录</h3>
          <p>{recordAccessMessage(access)}</p>
        </div>
      )}
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
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setData(readSummary());
    window.addEventListener("storage", refresh);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECORDS_CHANGED, refresh);
    };
  }, []);
  function clear() {
    if (
      !window.confirm("将删除当前浏览器的全部练习记录，无法恢复，确定清空吗？")
    )
      return;
    setError("");
    try {
      clearPracticeRecords();
      setData(readSummary());
      setNotice((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清空失败，请重试。");
    }
  }
  return (
    <>
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
          disabled={data.count === 0}
          onClick={clear}
        >
          <Trash2 className="ui-icon" aria-hidden="true" />
          清空记录
        </button>
        {data.error && (
          <button type="button" onClick={() => setData(readSummary())}>
            重新读取记录
          </button>
        )}
      </div>
      {notice > 0 && (
        <SuccessToast key={notice} message="练习记录已清空，自定义题库未修改" />
      )}
      {error && (
        <p role="alert" className="settings-message">
          {error}
        </p>
      )}
    </>
  );
}
