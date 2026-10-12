import { useRetainedData } from "../ui/useRetainedData";
import { useQuery } from "@tanstack/react-query";
import { ActionError } from "../ui/ActionError";
import { AsyncStatus } from "../ui/AsyncStatus";
import { useAssistantPageContext } from "../assistant/assistantContext";
import { exerciseSources } from "../practice-records/PracticeRecord";
import {
  useEffect,
  useState,
} from "react";
import { Eye, Trash2 } from "lucide-react";
import { useBrowsingState } from "../navigation/usePageNavigation";
import { SuccessToast } from "../ui/SuccessToast";
import {
  deletePracticeRecord,
  recordListOptions, recordTotalsOptions, type RecordSummary,
} from "../practice-records/practiceRecordStorage";
import { StoredRecordDetail } from "../practice-records/RecordDetail";
import { RecordFilters } from "../practice-records/RecordFilters";
import { PracticeActivityChart } from "../practice-records/PracticeActivityChart";
import { RecordPagination } from "../practice-records/RecordPagination";
import { type RecordFilter, type RecordPeriod } from "../practice-records/practiceRecords";


export default function PracticeRecordsPage() {
  return <section className="design-system practice-records-page"><title>练习记录 · 节奏训练</title><LocalRecords /></section>;
}

function LocalRecords() {
  const [filter, setFilter] = useBrowsingState<RecordFilter>(
    "record-filter",
    "all",
  );
  const [page, setPage] = useBrowsingState("record-page", 1);
  const [period, setPeriod] = useBrowsingState<RecordPeriod>("record-period", "all");
  const [now, setNow] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [deleteAttempt, setDeleteAttempt] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const tick = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(tick); window.removeEventListener("focus", refresh); };
  }, []);
  const query = useQuery(recordListOptions(filter, period, page, now));
  const totals = useQuery(recordTotalsOptions());
  const displayed = useRetainedData(query.data, query.isFetching || query.isError);
  const hasRecords = (totals.data?.recordCount ?? 0) > 0;
  const data = { records: displayed?.records ?? [], error: query.error?.message || totals.error?.message };
  const overview = displayed?.overview ?? { count: 0, days: 0, tappingCount: 0, passedCount: 0, passRate: null, dictationCount: 0, completedCount: 0, independentCount: 0 };
  const filtered = data.records;
  const selected = data.records.find(record => record.id === selectedId);
  const pagination = { page: displayed?.page ?? page, pages: displayed?.pages ?? 1 };
  const metrics = overview;
  const displayedFilter = displayed?.filter ?? filter;
  const updating = query.isFetching || totals.isFetching;
  const actionsDisabled = updating || Boolean(data.error);
  useAssistantPageContext({ page: "practice_records", description: "练习记录列表。统计仅覆盖当前时间和模式筛选；题目详情使用该题全部历史，不受列表时间筛选限制。",
    state: { status: data.error ? "read-error" : updating ? "loading" : "ready",
      filter: { mode: displayedFilter, period: displayed?.period ?? period, asOf: displayed?.asOf ?? now.toISOString() },
      ...(updating || data.error ? { requestedFilter: { mode: filter, period } } : {}),
      overview: data.error ? null : metrics, pagination: { page: pagination.page, pages: pagination.pages, totalRecords: displayed?.total ?? 0 },
      records: data.error ? [] : filtered.map(record => ({ id: record.id, source: record.source,
        exerciseId: record.exerciseId, title: record.title, mode: record.mode, allTimeAttempts: record.attemptCount })), selectedRecordId: selected?.id ?? null } });
  if (!query.isFetching && !query.error && page !== pagination.page) setPage(pagination.page);
  async function remove(record: RecordSummary) {
    if (
      !window.confirm(
        `确定删除“${record.title}”的全部 ${record.attemptCount} 次尝试？此操作无法撤销。`,
      )
    )
      return;
    setActionError("");
    setDeleteAttempt(value => value + 1);
    try {
      await deletePracticeRecord(record.id);
      setDeletedCount((value) => value + 1);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "删除失败，请重试。",
      );
    }
  }
  return (
    <>
      <header className="page-heading record-page-heading">
        <h1>练习记录</h1>
        <RecordFilters mode={filter} period={period}
          onModeChange={value => { if (value !== filter) { setFilter(value); setPage(1); } }}
          onPeriodChange={value => { if (value !== period) { setPeriod(value); setPage(1); setNow(new Date()); } }} />
      </header>
      {actionError && <ActionError key={deleteAttempt} message={actionError} />}
      <AsyncStatus className="record-query-status" pending={updating} initial={!displayed || !totals.data}
        label={displayed ? "正在更新…（暂显示上次结果）" : "正在读取练习记录…"} />
      {data.error && <p role="alert" className="practice-record-error">
        {data.error}{displayed && "；下方保留上次结果。"}
        <button type="button" onClick={() => { query.refetch(); totals.refetch(); }}>重新读取</button>
      </p>}
      <div className="record-results" aria-busy={updating}>
      {hasRecords && displayed && <section className="record-overview" aria-label="练习统计">
        <dl className="record-metrics">
          <div><dt>{displayedFilter === "dictation" ? "作答次数" : "练习次数"}</dt><dd>{overview.count}<span>次</span></dd></div>
          <div><dt>练习天数</dt><dd>{overview.days}<span>天</span></dd></div>
          {displayedFilter === "tapping" && <>
            <div><dt>通过次数</dt><dd>{overview.passedCount}<span>次</span></dd></div>
            <div><dt>通过率</dt><dd>{overview.passRate === null ? "—" : `${overview.passRate}%`}</dd></div>
          </>}
          {displayedFilter === "dictation" && <>
            <div><dt>完成次数</dt><dd>{overview.completedCount}<span>次</span></dd></div>
            <div><dt title="全部验证正确，且完成前未查看答案">独立完成</dt><dd>{overview.independentCount}<span>次</span></dd></div>
          </>}
        </dl>
        {displayed.activity && <PracticeActivityChart activity={displayed.activity} />}
      </section>}
      {!displayed || !totals.data ? null : filtered.length === 0 ? (
        <p className="library-empty-state">
          {hasRecords ? "当前条件下暂无记录" : "暂无练习记录"}
        </p>
      ) : (
        <ul className="record-list navigation-list">
          {filtered.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              disabled={actionsDisabled}
              onOpen={() => setSelectedId(record.id)}
              onDelete={() => remove(record)}
            />
          ))}
        </ul>
      )}
      <RecordPagination {...pagination} onChange={setPage} label="题目记录分页" disabled={actionsDisabled} />
      </div>
      {deletedCount > 0 && (
        <SuccessToast key={deletedCount} message="练习记录已删除" />
      )}
      {selected && (
        <StoredRecordDetail
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
  disabled,
}: {
  record: RecordSummary;
  onOpen: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <li className="record-entry">
      <div className="record-entry-content">
        <h2>{record.title}</h2>
        <p>
          {exerciseSources[record.source]} ·{" "}
          {record.mode === "tapping" ? "击拍练习" : "节奏听写"}
        </p>
      </div>
      <div className="record-entry-actions text-actions">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`查看详情：“${record.title}”的练习记录`}
          onClick={onOpen}
          disabled={disabled}
        >
          <Eye className="ui-icon" aria-hidden="true" />
          查看详情
        </button>
        <button
          type="button"
          className="local-data-clear"
          aria-label={`删除“${record.title}”的练习记录`}
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className="ui-icon" aria-hidden="true" />
          删除
        </button>
      </div>
    </li>
  );
}
