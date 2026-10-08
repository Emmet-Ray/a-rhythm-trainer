import { ActionError } from "../navigation/ActionError";
import { Plus, Pencil, Trash2, Play } from "lucide-react";
import { SuccessToast } from "../navigation/SuccessToast";
import { useAssistantPageContext } from "../assistant/assistantContext";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigationType, useMatch, useNavigate, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { PracticeHeading } from "../practice/PracticeHeading";
import { ExerciseWorkbench } from "../practice/ExerciseWorkbench";
import { useBrowsingState } from "../navigation/usePageNavigation";
import { getExercise, listExercises, deleteExercise, type ExerciseSummary } from "../api/customExercises";
import type { CustomExercise, CustomMode } from "../exercises/customExercises";

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;


export default function CustomPracticePage() {
  const { mode, exerciseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = useMatch("/custom/:mode/new") !== null;
  const isEdit = useMatch("/custom/:mode/:exerciseId/edit") !== null;
  const [lastMode, setLastMode] = useBrowsingState("custom:last-mode", "tapping");
  const selectedMode = customModes.find((item) => item.id === mode);
  useEffect(() => { if (selectedMode) setLastMode(selectedMode.id); }, [selectedMode, setLastMode]);
  if (mode === undefined) return <Navigate to={`/custom/${lastMode}`} replace />;
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (selectedMode && isNew) {
    return <ExerciseWorkbench key={`${selectedMode.id}:${location.key}`}
      initial={{ name: "", mode: selectedMode.id, exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [] }, { elements: [] }] } }}
      origin={null} initialEditing
      onCancelNew={() => navigate(`/custom/${selectedMode.id}`)}>
      {view => <div className="design-system practice-page custom-create">
        <title>{`${view.name || "新建练习"} · 节奏训练`}</title>
        <PracticeHeading backTo={`/custom/${selectedMode.id}`} backLabel="题目列表" title={view.title || "新建练习"}
          history={view.editing ? undefined : view.history}>{view.editAction}</PracticeHeading>
        {view.content}
      </div>}
    </ExerciseWorkbench>;
  }

  if (selectedMode && exerciseId) {
    // 路由参数改变时重新读取题目，并卸载旧训练及其音频、草稿和设置。
    return (
      <CustomExercisePractice
        key={`${selectedMode.id}:${exerciseId}`}
        mode={selectedMode.id}
        label={selectedMode.label}
        exerciseId={exerciseId}
        editing={isEdit}
      />
    );
  }

  if (selectedMode)
    return (
      <CustomExerciseList
        key={`${selectedMode.id}`}
        mode={selectedMode.id}
        label={selectedMode.label}
      />
    );

  return <NotFoundPage />;
}

function CustomExerciseList({
  mode,
  label,
}: {
  mode: CustomMode;
  label: string;
}) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const navigationType = useNavigationType();
  type ListResult = {
    items: ExerciseSummary[];
    error: string | null;
    loading: boolean;
  };
  function readExercises(): ListResult { return {items: [], error: null, loading: true}; }
  const [result, setResult] = useState(readExercises);
  const [offset, setOffset] = useBrowsingState(
    `custom:${mode}:offset`,
    0,
  );
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  useAssistantPageContext({ page: "custom_library", description: "自定义题目列表，仅有题目摘要，不代表已读取每道题的谱面。列表仅表示已加载的一页。",
    state: { mode, source: "instance", status: result.loading ? "loading" : result.error ? "read-error" : "ready",
      offset, loadedCount: result.items.length, totalCount: null,
      items: result.items.slice(0, 50).map(item => ({ id: item.id, name: item.name, mode: item.mode,
        measureCount: null })), truncated: result.items.length > 50 } });
  const mutationActive = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current += 1; }, []);
  async function remove(item: ExerciseSummary) {
    if (mutationActive.current || !window.confirm(`确定删除「${item.name}」吗？删除后无法恢复。`)) return;
    mutationActive.current = true;
    const generation = lifetime.current;
    setDeleting(item.id);
    setMutationError(null);
    setMutationMessage(null);
    try {
      await deleteExercise(item.id);
      if (generation !== lifetime.current) return;
      setMutationMessage(`已删除「${item.name}」。`);
      reload();
    } catch (error) {
      if (generation === lifetime.current) setMutationError(error instanceof Error ? error.message : "删除失败，请重试。");
    } finally {
      if (generation === lifetime.current) {
        mutationActive.current = false;
        setDeleting(null);
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void listExercises(mode, { offset, signal: controller.signal })
      .then((page) => {
        if (
          !controller.signal.aborted &&
          offset > 0 &&
          page.items.length === 0
        ) {
          // 返回期间数据可能被删除，退到仍有内容的最近一页，再恢复滚动。
          setOffset(Math.max(0, offset - 50));
          return;
        }
        if (!controller.signal.aborted)
          setResult({ items: page.items, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            items: [],
            error:
              error instanceof Error ? error.message : "读取失败，请重试。",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [mode, offset, revision, setOffset]);
  function reload(nextOffset = offset) {
    setResult(readExercises());
    setOffset(nextOffset);
    setRevision((value) => value + 1);
  }
  return (
    <div className="design-system practice-page custom-library">
      <title>{`自定义${label} · 节奏训练`}</title>
      {navigationType !== "POP" && state?.createdExercise === true && <SuccessToast message="练习已创建" />}
      <header className="practice-titlebar custom-list-heading">
        <h1>自定义练习</h1>
        <Link className="custom-new-link" to={`/custom/${mode}/new`}>
          <Plus className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" />新建练习
        </Link>
      </header>
      <div className="topic-modes library-mode-switch" role="group" aria-label="训练方式">
        {customModes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id}
          onClick={() => { if (mode !== item.id) navigate(`/custom/${item.id}`); }}>{item.label}</button>)}
      </div>
      <section className="custom-catalog" aria-label="题目列表">
      {mutationError && <ActionError message={mutationError} />}
      {mutationMessage && <SuccessToast key={mutationMessage} message={mutationMessage} />}
      {result.error ? (
        <div className="custom-storage-error">
          <p role="alert">{result.error}</p>
          <button type="button" onClick={() => reload()}>
            重试读取
          </button>
        </div>
      ) : result.loading ? (
        <p role="status" data-navigation-pending>
          正在读取练习…
        </p>
      ) : result.items.length === 0 ? (
        <p className="library-empty-state">
          {mode === "tapping" ? "暂无击拍练习" : "暂无听写练习"}
        </p>
      ) : (
        <ul className="question-list navigation-list" aria-label="已保存的自定义练习">
          {result.items.map((item) => (
            <li
              className="custom-saved-question"
              key={item.id}
            >
                <div className="custom-question-name">
                  <h2>{item.name}</h2>
                </div>
              <div className="custom-question-actions" aria-label={`${item.name}的管理操作`}>
                <Link className="custom-start-action" to={`/custom/${mode}/${encodeURIComponent(item.id)}`}>
                  <Play className="ui-icon" aria-hidden="true" focusable="false" />开始练习
                </Link>
                <Link to={`/custom/${mode}/${encodeURIComponent(item.id)}/edit`}>
                  <Pencil className="ui-icon" aria-hidden="true" />编辑
                </Link>
                <button type="button" disabled={deleting !== null} onClick={() => void remove(item)}>
                  <Trash2 className="ui-icon" aria-hidden="true" />{deleting === item.id ? "正在删除…" : "删除"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!result.loading && !result.error && result.items.length > 0 && (offset > 0 || result.items.length === 50) && (
        <nav aria-label="题目分页">
          <button
            type="button"
            disabled={result.loading || deleting !== null || offset === 0}
            onClick={() => reload(Math.max(0, offset - 50))}
          >
            上一页
          </button>
          <span> 第 {offset / 50 + 1} 页 </span>
          <button
            type="button"
            disabled={
              result.loading || deleting !== null || !!result.error || result.items.length < 50
            }
            onClick={() => reload(offset + 50)}
          >
            下一页
          </button>
        </nav>
      )}
      </section>
    </div>
  );
}

function CustomExercisePractice({
  mode,
  label,
  exerciseId,
  editing,
}: {
  mode: CustomMode;
  label: string;
  exerciseId: string;
  editing: boolean;
}) {
  function readExercise(): { item: CustomExercise | undefined; error: string | null; loading: boolean } { return {item: undefined, error: null, loading: true}; }
  const [result, setResult] = useState(readExercise);
  useAssistantPageContext(result.loading || result.error || !result.item ? { page: "custom_practice", description: "自定义题目读取状态。",
    state: { mode, source: "instance", status: result.loading ? "loading" : result.error ? "read-error" : "not-found" } } : null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getExercise(exerciseId, controller.signal)
      .then((item) => {
        if (!controller.signal.aborted)
          setResult({
            item: item.mode === mode ? item : undefined,
            error: null,
            loading: false,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            item: undefined,
            error:
              error instanceof Error ? error.message : "读取失败，请重试。",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [exerciseId, mode, revision]);
  if (result.item) return <ExerciseWorkbench initial={result.item}
    origin={{ source: "custom", exerciseId: result.item.id, title: result.item.name }} initialEditing={editing}>
    {view => <div className="design-system practice-page custom-detail">
      <title>{`${view.name} · ${label}`}</title>
      <PracticeHeading backTo={`/custom/${mode}`} backLabel="题目列表" title={view.title}
        history={view.editing ? undefined : view.history}>{view.editAction}</PracticeHeading>
      {view.content}
    </div>}
  </ExerciseWorkbench>;
  return (
    <div className={`design-system practice-page ${editing ? "custom-create" : "custom-detail"}`}>
      <title>{`自定义练习 · ${label}`}</title>
      <PracticeHeading
        backTo={`/custom/${mode}`}
        backLabel="题目列表"
        title={
          (result.loading
            ? "正在读取练习…"
            : result.error
              ? "无法读取练习"
              : "未找到该练习")
        }
      />
      {result.error ? (
        <div className="custom-storage-error">
          <p role="alert">{result.error}</p>
          <button
            type="button"
            onClick={() => {
              setResult(readExercise());
              setRevision((value) => value + 1);
            }}
          >
            重试读取
          </button>
        </div>
      ) : result.loading ? (
        <p role="status" data-navigation-pending>
          正在读取练习…
        </p>
      ) : (
        <p>
          当前实例中没有该模式的这道练习
        </p>
      )}
    </div>
  );
}
