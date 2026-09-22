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
import { RecordPagination } from "../practice-records/RecordPagination";
import { recordPage, recordOverview, type RecordFilter, type RecordPeriod } from "../practice-records/practiceRecords";

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
      {access === "guest" ? (
        <LocalRecords />
      ) : (
        <><header className="page-heading"><h1>练习记录</h1></header>
        <p role="status">{recordAccessMessage(access)}</p></>
      )}
    </section>
  );
}

function LocalRecords() {
  const [data, setData] = useState(readRecords);
  const [filter, setFilter] = useBrowsingState<RecordFilter>(
    "record-filter",
    "all",
  );
  const [page, setPage] = useBrowsingState("record-page", 1);
  const [period, setPeriod] = useBrowsingState<RecordPeriod>("record-period", "all");
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deletedCount, setDeletedCount] = useState(0);
  useEffect(() => {
    const refresh = () => { setData(readRecords()); setNow(new Date()); };
    const tick = window.setInterval(() => setNow(new Date()), 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener(RECORDS_CHANGED, refresh);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECORDS_CHANGED, refresh);
    };
  }, []);
  const overview = recordOverview(data.records, filter, period, now);
  const filtered = overview.records;
  const selected = data.records.find((record) => record.id === selectedId);
  const pagination = recordPage(filtered.length, page);
  if (page !== pagination.page) setPage(pagination.page);
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
        <header className="page-heading"><h1>练习记录</h1></header>
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
      <header className="page-heading record-page-heading">
        <h1>练习记录</h1>
        <div className="topic-modes record-period" role="group" aria-label="记录时间范围">
          {([['week', '近 7 天'], ['month', '近 30 天'], ['all', '全部']] as const).map(([value, label]) => (
            <button type="button" key={value} aria-pressed={period === value} onClick={() => {
              setPeriod(value); setPage(1); setNow(new Date());
            }}>{label}</button>
          ))}
        </div>
      </header>
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
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="record-overview" aria-label="练习统计">
        <dl className="record-metrics">
          <div><dt>{filter === "dictation" ? "作答次数" : "练习次数"}</dt><dd>{overview.count}<span>次</span></dd></div>
          <div><dt>练习天数</dt><dd>{overview.days}<span>天</span></dd></div>
          {filter === "tapping" && <>
            <div><dt>通过次数</dt><dd>{overview.passedCount}<span>次</span></dd></div>
            <div><dt>通过率</dt><dd>{overview.passRate === null ? "—" : `${overview.passRate}%`}</dd></div>
          </>}
          {filter === "dictation" && <>
            <div><dt>完成次数</dt><dd>{overview.completedCount}<span>次</span></dd></div>
            <div><dt title="全部验证正确，且完成前未查看答案">独立完成</dt><dd>{overview.independentCount}<span>次</span></dd></div>
          </>}
        </dl>
      </section>
      {filtered.length === 0 ? (
        <p className="records-empty">
          {period === "all" ? "暂无" : "所选时间范围内暂无"}{filter === "all" ? "" : filter === "tapping" ? "击拍" : "听写"}
          练习记录。
        </p>
      ) : (
        <ul className="record-list navigation-list">
          {filtered.slice(pagination.start, pagination.end).map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              onOpen={() => setSelectedId(record.id)}
              onDelete={() => remove(record)}
            />
          ))}
        </ul>
      )}
      <RecordPagination {...pagination} onChange={setPage} label="题目记录分页" />
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
