import {
  useContext,
  useEffect,
  useState,
} from "react";
import { Eye, Trash2 } from "lucide-react";
import { useBrowsingState } from "../navigation/usePageNavigation";
import { SuccessToast } from "../navigation/SuccessToast";
import type {
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
import { RecordDetail } from "../practice-records/RecordDetail";

const sources = { preset: "预设", random: "随机", custom: "自定义" };
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
  const [filter, setFilter] = useBrowsingState<RecordFilter>(
    "record-filter",
    "all",
  );
  const [limit, setLimit] = useBrowsingState("record-limit", 20);
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
