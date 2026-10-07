import { ActionError } from "../navigation/ActionError";
import { LoaderCircle, Minus, Plus, Save, Pencil, Trash2, Play } from "lucide-react";
import { SuccessToast } from "../navigation/SuccessToast";
import { useAssistantExerciseTarget, useAssistantPageContext } from "../assistant/assistantContext";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import { flushSync } from "react-dom";
import { UnsavedChanges } from "../navigation/UnsavedChanges";
import {
  Suspense,
  useCallback,
  useId,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigationType,
  useMatch,
  useNavigate,
  useParams,
} from "react-router";
import NotFoundPage from "./NotFoundPage";
import { PracticeHeading } from "../practice/PracticeHeading";
import { editorModule, workspaceModule } from "../practice/practiceModules";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";
import { useBrowsingState, useVisitState } from "../navigation/usePageNavigation";
import {
  parseRhythmExercise,
  expandRhythmElements,
  TICKS_PER_QUARTER,
  type RhythmElement,
  type RhythmExercise,
} from "../rhythm/RhythmModel";
import {
  getExercise,
  listExercises,
  saveExercise,
  updateExercise,
  deleteExercise,
  type ExerciseSummary,
} from "../api/customExercises";
import type { RhythmEditorHandle } from "../practice/RhythmEditor";
import PracticeSettings, {
  type PracticeSettingsValue,
} from "../practice/PracticeSettings";
import RhythmPlayback from "../practice/RhythmPlayback";
import PracticeCue from "../practice/PracticeCue";
import {
  type CustomExercise,
  type CustomMode,
} from "../exercises/customExercises";

// 题目列表不加载 VexFlow；进入新建页面后才加载编辑器。
const RhythmEditor = editorModule.Component;
const PracticeWorkspace = workspaceModule.Component;

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;


export default function CustomPracticePage() {
  const { mode, exerciseId } = useParams();
  const isNew = useMatch("/custom/:mode/new") !== null;
  const isEdit = useMatch("/custom/:mode/:exerciseId/edit") !== null;
  const [lastMode, setLastMode] = useBrowsingState("custom:last-mode", "tapping");
  const selectedMode = customModes.find((item) => item.id === mode);
  useEffect(() => { if (selectedMode) setLastMode(selectedMode.id); }, [selectedMode, setLastMode]);
  if (mode === undefined) return <Navigate to={`/custom/${lastMode}`} replace />;
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (selectedMode && isNew) {
    return (
      <div className="design-system practice-page custom-create">
        <title>{`新建${selectedMode.label} · 节奏训练`}</title>
        <PracticeHeading
          backTo={`/custom/${selectedMode.id}`}
          backLabel="题目列表"
          title="新建练习"
        />
        <Suspense
          fallback={
            <LoadingPlaceholder workspace label="正在加载编辑器…" />
          }
        >
          {/* 换模式即新草稿，不把一道题自动共享给两种训练方式。 */}
          <CustomExerciseEditor
            key={`${selectedMode.id}`}
            mode={selectedMode.id}
          />
        </Suspense>
      </div>
    );
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
  return (
    <div className={`design-system practice-page ${editing ? "custom-create" : "custom-detail"}`}>
      <title>{`${result.item?.name ?? "自定义练习"} · ${label}`}</title>
      <PracticeHeading
        backTo={`/custom/${mode}`}
        backLabel="题目列表"
        title={
          (result.item ? (editing ? `编辑：${result.item.name}` : result.item.name) : undefined) ??
          (result.loading
            ? "正在读取练习…"
            : result.error
              ? "无法读取练习"
              : "未找到该练习")
        }
        history={!editing && result.item ? { context: { source: "custom", exerciseId: result.item.id, title: result.item.name }, exercise: result.item.exercise, mode } : undefined}
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
      ) : result.item ? (
        <Suspense
          fallback={
            <LoadingPlaceholder workspace label="正在加载练习…" />
          }
        >
          {editing ? <CustomExerciseEditor mode={mode} initial={result.item} onSaved={(item) => setResult({ item, error: null, loading: false })} /> : <PracticeWorkspace
            recoveryScope={`custom:${mode}:${result.item.id}`}
            exercise={result.item.exercise}
            mode={mode}
            exerciseKey={result.item.id}
            recordContext={{ source: "custom", exerciseId: result.item.id, title: result.item.name }}
          />}
        </Suspense>
      ) : (
        <p>
          当前实例中没有该模式的这道练习
        </p>
      )}
    </div>
  );
}

const timeSignature: RhythmExercise["timeSignature"] = {
  beats: 4,
  beatType: 4,
};

/**
 * 一次历史访问及身份对应一份未保存草稿。允许小节未填满，试听保留完整小节时长，不做判题。
 * 小节只从末尾增减，删除有内容的小节需确认；至少保留一节，选择始终在有效范围内。
 * 返回原记录时恢复草稿，新建访问不复用；保存成功只清除提交版本，失败时保留。
 */
function CustomExerciseEditor({
  mode,
  initial,
  onSaved,
}: {
  mode: CustomMode;
  initial?: CustomExercise;
  onSaved?: (item: CustomExercise) => void;
}) {
  const navigate = useNavigate();
  const nameErrorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [draft, setDraft, forgetDraft] = useVisitState<{
    name: string;
    measures: RhythmElement[][];
    selectedMeasureIndex: number;
    settings: PracticeSettingsValue;
  }>(`custom:${mode}:${initial?.id ?? "new"}:draft`, {
    name: initial?.name ?? "",
    measures: initial?.exercise.measures.map(measure => measure.elements) ?? [[], []],
    selectedMeasureIndex: 0,
    settings: { bpm: 60, metronomeEnabled: true },
  });
  const { name, measures, selectedMeasureIndex } = draft;
  useAssistantPageContext({
    page: "custom_exercise_editor",
    description: "自定义练习编辑页，正在编辑未保存草稿；小节可能未填满，selectedMeasureIndex 从 0 开始。",
    state: { mode, name, exercise_id: initial?.id ?? null, source: "instance",
      timeSignature: { beats: 4, beatType: 4 }, measure_count: measures.length,
      measures: measures.map(elements => ({ elements })), selectedMeasureIndex,
      bpm: draft.settings.bpm, metronomeEnabled: draft.settings.metronomeEnabled },
  });
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [saveNotice, setSaveNotice] = useState(0);
  const [savedContent, setSavedContent] = useState(() => ({
    name: initial?.name ?? "",
    measures: initial?.exercise.measures.map(measure => measure.elements) ?? [[], []],
  }));
  const dirty = !(!initial && savedSuccessfully) && (name !== savedContent.name
    || JSON.stringify(measures) !== JSON.stringify(savedContent.measures));
  const rememberSettings = useCallback(
    (settings: PracticeSettingsValue) => {
      setDraft((previous) => ({ ...previous, settings }));
    },
    [setDraft],
  );
  const editorRef = useRef<RhythmEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const saveGeneration = useRef(0);

  useEffect(() => {
    // 卸载后，旧保存仍可能在服务器完成，但不能再导航或覆盖当前草稿提示。
    return () => {
      saveGeneration.current += 1;
    };
  }, []);

  const [assistantApplied, setAssistantApplied] = useState(false);
  const [assistantRevision, setAssistantRevision] = useState(0);
  useEffect(() => {
    if (assistantRevision === 0) return;
    const timer = window.setTimeout(() => setAssistantApplied(false), 3500);
    return () => window.clearTimeout(timer);
  }, [assistantRevision]);
  const applyAssistantExercise = useCallback((proposal: GeneratedExercise) => {
    if (locked.current) return false;
    setDraft(previous => ({ ...previous, name: proposal.title,
      measures: structuredClone(proposal.exercise.measures.map(measure => measure.elements)),
      selectedMeasureIndex: 0 }));
    setAssistantRevision(value => value + 1);
    setAssistantApplied(true);
    setNameError(false);
    setSavedSuccessfully(false);
    setSaveError(null);
    editorRef.current?.clearMessage();
    return true;
  }, [setDraft]);
  useAssistantExerciseTarget(saving ? null : applyAssistantExercise);

  function addMeasure() {
    setSaveError(null);
    setDraft((previous) => ({
      ...previous,
      measures: [...previous.measures, []],
    }));
    editorRef.current?.clearMessage();
  }

  function removeMeasure() {
    if (measures.length <= 1) return;
    const lastMeasure = measures[measures.length - 1];
    // 确认放在事件处理器中，而非 React 状态更新函数中，避免重复弹窗。
    if (
      lastMeasure.length > 0 &&
      !window.confirm(
        `第 ${measures.length} 小节已有内容，确定删除这个小节吗？`,
      )
    )
      return;

    setDraft((previous) => ({
      ...previous,
      measures: previous.measures.slice(0, -1),
      selectedMeasureIndex: Math.min(
        previous.selectedMeasureIndex,
        previous.measures.length - 2,
      ),
    }));
    setSaveError(null);
    editorRef.current?.clearMessage();
  }

  async function save() {
    if (locked.current) return;
    setSaveError(null);
    if (!name.trim()) {
      setNameError(true);
      nameInput.current?.focus();
      return;
    }
    setNameError(false);
    const invalidMeasure = measures.findIndex(elements => expandRhythmElements(elements).durationTicks !== timeSignature.beats * TICKS_PER_QUARTER);
    if (invalidMeasure !== -1) {
      const beats = expandRhythmElements(measures[invalidMeasure]).durationTicks / TICKS_PER_QUARTER;
      setDraft(previous => ({ ...previous, selectedMeasureIndex: invalidMeasure }));
      editorRef.current?.showMessage(`第 ${invalidMeasure + 1} 小节${beats < 4 ? `还差 ${4 - beats} 拍` : `超出 ${beats - 4} 拍`}，请修改后保存`);
      return;
    }
    locked.current = true;
    setSaving(true);
    const generation = saveGeneration.current;
    setSaveError(null);
    try {
      const candidate = {
        name: name.trim(),
        mode,
        exercise: {
          timeSignature,
          measures: measures.map((elements) => ({ elements })),
        },
      };
      if (!candidate.name) throw new Error("请输入练习名称");
      candidate.exercise = parseRhythmExercise(candidate.exercise);
      const saved =
        initial
          ? await updateExercise(initial.id, candidate)
          : await saveExercise(candidate);
      // 即使已离开，确认保存成功也清除原提交快照；后来修改的新版本不会被清除。
      forgetDraft(draft);
      if (generation !== saveGeneration.current) return;
      const content = { name: saved.name, measures: saved.exercise.measures.map(measure => measure.elements) };
      if (initial) {
        setSavedContent(content);
        setDraft(previous => ({ ...previous, ...content }));
        setSavedSuccessfully(true);
        setSaveNotice(value => value + 1);
        onSaved?.(saved);
        return;
      }
      flushSync(() => {
        setSavedContent(content);
        setSavedSuccessfully(true);
      });
      // 写入成功才离开编辑页，卸载播放器会取消旧声音和异步启动。
      navigate(`/custom/${mode}`, {
        replace: true,
        state: { createdExercise: true },
      });
    } catch (error) {
      if (generation === saveGeneration.current)
        setSaveError(
          error instanceof Error ? error.message : "保存失败，请重试。",
        );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return (
    <section
      className="custom-exercise-editor practice-layout--sidebar"
      aria-label="编辑自定义练习"
    >
      <UnsavedChanges dirty={dirty || (saving && !savedSuccessfully)} />
      {saveNotice > 0 && !saving && !saveError && <SuccessToast key={saveNotice} message="修改已保存" />}
      <fieldset className="custom-exercise-fields" disabled={saving}>
        <PracticeSettings
          layout="sidebar"
          initialValue={draft.settings}
          onChange={rememberSettings}
          extraControls={
            <div
              className="custom-measure-count"
              role="group"
              aria-label="小节数量"
            >
              <span>小节数量</span>
              <div className="custom-measure-stepper">
                <button
                  type="button"
                  aria-label="减少小节"
                  disabled={measures.length === 1}
                  onClick={removeMeasure}
                >
                  <Minus className="ui-icon ui-icon--control" aria-hidden="true" focusable="false" />
                </button>
                <output aria-label="当前小节数量">{measures.length}</output>
                <button
                  type="button"
                  aria-label="增加小节"
                  onClick={addMeasure}
                >
                  <Plus className="ui-icon ui-icon--control" aria-hidden="true" focusable="false" />
                </button>
              </div>
            </div>
          }
        >
          {({ bpm, metronomeEnabled }, settingsPanel) => (
            <>
              <div className="practice-toolbar custom-editor-toolbar">
                <label className="custom-name">
                  <span>练习名称</span>
                  <input
                    ref={nameInput}
                    aria-label="练习名称"
                    aria-invalid={nameError || undefined}
                    aria-describedby={nameError ? nameErrorId : undefined}
                    value={name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft((previous) => ({ ...previous, name }));
                      setSaveError(null);
                      setNameError(false);
                    }}
                  />
                  <span id={nameErrorId} className="custom-name-error" aria-live="polite">{nameError ? "请输入练习名称" : ""}</span>
                </label>
                <div
                  className="custom-editor-actions"
                  role="group"
                  aria-label="试听与保存"
                >
                  <RhythmPlayback
                    key={[bpm, measures.length, assistantRevision].join(":")}
                    bpm={bpm}
                    metronomeEnabled={metronomeEnabled}
                    timeSignature={timeSignature}
                    options={[
                      {
                        id: "draft",
                        label: "试听",
                        stopLabel: "停止",
                        measures,
                      },
                    ]}
                    onCountInChange={setCountdown}
                  />
                  <button
                    className="custom-save-button"
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                  >
                    {saving ? <LoaderCircle className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" /> : <Save className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" />}
                    {saving ? "正在保存…" : initial ? "保存修改" : "保存练习"}
                  </button>
                </div>
                {assistantApplied && <SuccessToast key={assistantRevision} message="已放入，可继续编辑" />}
                {saveError && <ActionError message={saveError} onRetry={() => void save()} />}
              </div>
              <div className="practice-body">
                {settingsPanel}
                <div className="practice-content">
                  <RhythmEditor
                    ref={editorRef}
                    scoreOverlay={
                      countdown !== null ? (
                        <PracticeCue countdown={countdown} />
                      ) : null
                    }
                    measures={measures}
                    timeSignature={timeSignature}
                    selectedMeasureIndex={selectedMeasureIndex}
                    onSelectMeasure={(selectedMeasureIndex) =>
                      setDraft((previous) => ({
                        ...previous,
                        selectedMeasureIndex,
                      }))
                    }
                    onChange={(measureIndex, elements) => {
                      setSaveError(null);
                      setDraft((previous) => ({
                        ...previous,
                        measures: previous.measures.map((measure, index) =>
                          index === measureIndex ? elements : measure,
                        ),
                      }));
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </PracticeSettings>
      </fieldset>
    </section>
  );
}
