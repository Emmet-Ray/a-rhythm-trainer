import { ArrowLeft, ArrowRight, Hand, Ear, LoaderCircle, Minus, Plus, Save, Pencil, Trash2, Play } from "lucide-react";
import { SuccessToast } from "../navigation/SuccessToast";
import { flushSync } from "react-dom";
import { UnsavedChanges } from "../navigation/UnsavedChanges";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigationType,
  useMatch,
  useNavigate,
  useParams,
} from "react-router";
import NotFoundPage from "./NotFoundPage";
import { ReturnLink } from "../navigation/PageNavigation";
import { PracticeHeading } from "../practice/PracticeHeading";
import { editorModule, workspaceModule } from "../practice/practiceModules";
import { LoadingPlaceholder } from "../navigation/LoadingPlaceholder";
import { useBrowsingState, useVisitState } from "../navigation/usePageNavigation";
import {
  parseRhythmExercise,
  type RhythmElement,
  type RhythmExercise,
} from "../rhythm/RhythmModel";
import type { useAuth } from "../auth/useAuth";
import {
  getAccountExercise,
  listAccountExercises,
  saveAccountExercise,
  updateAccountExercise,
  deleteAccountExercise,
  type AccountExerciseSummary,
} from "../api/customExercises";
import type { RhythmEditorHandle } from "../practice/RhythmEditor";
import PracticeSettings, {
  type PracticeSettingsValue,
} from "../practice/PracticeSettings";
import RhythmPlayback from "../practice/RhythmPlayback";
import PracticeCue from "../practice/PracticeCue";
import {
  listCustomExercises,
  saveCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
  type CustomExercise,
  type CustomMode,
} from "../exercises/customExercises";

// 选择训练方式时不加载 VexFlow；进入新建页面后才加载编辑器。
const RhythmEditor = editorModule.Component;
const PracticeWorkspace = workspaceModule.Component;

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习", icon: Hand },
  { id: "dictation", label: "节奏听写", icon: Ear },
] as const;

type Auth = ReturnType<typeof useAuth>;
type Source = "local" | "account";

export default function CustomPracticePage({ auth }: { auth: Auth }) {
  const { mode, exerciseId } = useParams();
  const isNew = useMatch("/custom/:mode/new") !== null;
  const accountMatch = useMatch("/custom/:mode/account/:exerciseId/*");
  const isAccount = accountMatch !== null;
  const isLocalEdit = useMatch("/custom/:mode/:exerciseId/edit") !== null;
  const isEdit = isLocalEdit || accountMatch?.params["*"] === "edit";
  const source: Source =
    auth.state.status === "authenticated" ? "account" : "local";
  const identity =
    auth.state.status === "authenticated"
      ? `account:${auth.state.user.id}`
      : auth.state.status;
  const selectedMode = customModes.find((item) => item.id === mode);
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (
    selectedMode &&
    (auth.state.status === "checking" ||
      auth.state.status === "unavailable" ||
      auth.busy)
  ) {
    return (
      <div className="design-system practice-page custom-status">
        <ReturnLink className="back-link" to="/custom">
          <ArrowLeft className="ui-icon" aria-hidden="true" focusable="false" /> 返回自定义练习
        </ReturnLink>
        <p
          role="status"
          data-navigation-pending={
            auth.state.status === "checking" || auth.busy ? true : undefined
          }
        >
          {auth.state.status === "unavailable"
            ? "无法确认登录状态，请重试后读取练习。"
            : "正在确认登录…"}
        </p>
        {auth.state.status === "unavailable" && (
          <button type="button" disabled={auth.busy} onClick={auth.refresh}>
            重试
          </button>
        )}
      </div>
    );
  }

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
            key={`${identity}:${selectedMode.id}`}
            mode={selectedMode.id}
            auth={auth}
            identity={identity}
          />
        </Suspense>
      </div>
    );
  }

  if (selectedMode && exerciseId) {
    if (isAccount && source !== "account")
      return (
        <div className="design-system practice-page custom-status">
          <p>{auth.state.status === "disabled" ? "此站点未启用账号功能，无法读取账号练习。" : "请登录后查看账号练习。"}</p>
          {auth.state.status !== "disabled" && <><Link to="/settings?category=account">登录</Link> ·{" "}</>}
          <ReturnLink to={`/custom/${selectedMode.id}`}>
            返回题目列表
          </ReturnLink>
        </div>
      );
    // 路由参数改变时重新读取题目，并卸载旧训练及其音频、草稿和设置。
    return (
      <CustomExercisePractice
        key={`${identity}:${isAccount}:${selectedMode.id}:${exerciseId}`}
        identity={identity}
        source={isAccount ? "account" : "local"}
        mode={selectedMode.id}
        label={selectedMode.label}
        exerciseId={exerciseId}
        editing={isEdit}
        auth={auth}
      />
    );
  }

  if (selectedMode)
    return (
      <CustomExerciseList
        key={`${identity}:${selectedMode.id}`}
        source={source}
        identity={identity}
        mode={selectedMode.id}
        label={selectedMode.label}
      />
    );

  return (
    <div className="design-system custom-index">
      <title>自定义练习 · 节奏训练</title>
      <header className="page-heading">
        <h1>自定义练习</h1>
      </header>
      <section
        className="custom-mode-selection"
        aria-labelledby="custom-mode-heading"
      >
        <h2 id="custom-mode-heading">选择训练方式</h2>
        <ul className="question-list navigation-list">
          {customModes.map((item) => (
            <li key={item.id}>
              <Link className="question-link" to={`/custom/${item.id}`}>
                <h3 className="mode-entry-label"><item.icon className="ui-icon ui-icon--control" aria-hidden="true" focusable="false" />{item.label}</h3>
                <span className="question-action">
                  查看题目 <ArrowRight className="ui-icon" aria-hidden="true" focusable="false" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mode-unavailable">几何游戏暂未开放</p>
      </section>
    </div>
  );
}

function CustomExerciseList({
  mode,
  label,
  source,
  identity,
}: {
  mode: CustomMode;
  label: string;
  source: Source;
  identity: string;
}) {
  const { state } = useLocation();
  const navigationType = useNavigationType();
  type ListResult = {
    items: (CustomExercise | AccountExerciseSummary)[];
    error: string | null;
    loading: boolean;
  };
  function readExercises(): ListResult {
    if (source === "account") return { items: [], error: null, loading: true };
    try {
      return { items: listCustomExercises(mode), error: null, loading: false };
    } catch (error) {
      return {
        items: [],
        error: error instanceof Error ? error.message : "读取失败，请重试。",
        loading: false,
      };
    }
  }
  const [result, setResult] = useState(readExercises);
  const [offset, setOffset] = useBrowsingState(
    `custom:${identity}:${mode}:offset`,
    0,
  );
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationActive = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current += 1; }, []);
  async function remove(item: CustomExercise | AccountExerciseSummary) {
    if (mutationActive.current || !window.confirm(`确定删除「${item.name}」吗？删除后无法恢复。`)) return;
    mutationActive.current = true;
    const generation = lifetime.current;
    setDeleting(item.id);
    setMutationError(null);
    setMutationMessage(null);
    try {
      if (source === "account") await deleteAccountExercise(item.id);
      else deleteCustomExercise(item.id, mode);
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
    if (source !== "account") return;
    const controller = new AbortController();
    void listAccountExercises(mode, { offset, signal: controller.signal })
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
  }, [source, mode, offset, revision, setOffset]);
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
        <ReturnLink className="practice-return" to="/custom">
          <ArrowLeft className="ui-icon" aria-hidden="true" focusable="false" /> 自定义练习
        </ReturnLink>
        <h1>{label}</h1>
        <Link className="custom-new-link" to={`/custom/${mode}/new`}>
          <Plus className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" />新建练习
        </Link>
      </header>
      <section className="custom-catalog" aria-label="题目列表">
      {mutationError && <p className="custom-mutation-error" role="alert">{mutationError}</p>}
      {mutationMessage && <p role="status">{mutationMessage}</p>}
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
        <p className="empty-questions">
          还没有练习，点击上方「新建练习」开始创建。
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
                <Link className="custom-start-action" to={`/custom/${mode}/${source === "account" ? "account/" : ""}${encodeURIComponent(item.id)}`}>
                  <Play className="ui-icon" aria-hidden="true" focusable="false" />开始练习
                </Link>
                <Link to={`/custom/${mode}/${source === "account" ? "account/" : ""}${encodeURIComponent(item.id)}/edit`}>
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
      {source === "account" && (
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
  source,
  identity,
  editing,
  auth,
}: {
  mode: CustomMode;
  label: string;
  exerciseId: string;
  source: Source;
  identity: string;
  editing: boolean;
  auth: Auth;
}) {
  function readExercise(): {
    item: CustomExercise | undefined;
    error: string | null;
    loading: boolean;
  } {
    if (source === "account")
      return { item: undefined, error: null, loading: true };
    try {
      // 只在所属模式中查找，不能修改 URL 把听写题作为击拍题打开。
      return {
        item: listCustomExercises(mode).find((item) => item.id === exerciseId),
        error: null,
        loading: false,
      };
    } catch (error) {
      return {
        item: undefined,
        error: error instanceof Error ? error.message : "读取失败，请重试。",
        loading: false,
      };
    }
  }
  const [result, setResult] = useState(readExercise);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (source !== "account") return;
    const controller = new AbortController();
    void getAccountExercise(exerciseId, controller.signal)
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
  }, [source, exerciseId, mode, revision]);
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
          {editing ? <CustomExerciseEditor mode={mode} auth={auth} identity={identity} initial={result.item} source={source}
            onSaved={(item) => setResult({ item, error: null, loading: false })} /> : <PracticeWorkspace
            recoveryScope={`custom:${identity}:${source}:${mode}:${result.item.id}`}
            exercise={result.item.exercise}
            mode={mode}
            exerciseKey={result.item.id}
            recordContext={{ source: "custom", exerciseId: result.item.id, title: result.item.name }}
          />}
        </Suspense>
      ) : (
        <p>
          {source === "account"
            ? "当前账号中没有该模式的这道练习。"
            : "当前浏览器中没有该模式的这道练习。"}
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
  auth,
  identity,
  initial,
  onSaved,
  source = auth.state.status === "authenticated" ? "account" : "local",
}: {
  mode: CustomMode;
  auth: Auth;
  identity: string;
  initial?: CustomExercise;
  onSaved?: (item: CustomExercise) => void;
  source?: Source;
}) {
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [draft, setDraft, forgetDraft] = useVisitState<{
    name: string;
    measures: RhythmElement[][];
    selectedMeasureIndex: number;
    settings: PracticeSettingsValue;
  }>(`custom:${identity}:${source}:${mode}:${initial?.id ?? "new"}:draft`, {
    name: initial?.name ?? "",
    measures: initial?.exercise.measures.map(measure => measure.elements) ?? [[], []],
    selectedMeasureIndex: 0,
    settings: { bpm: 60, metronomeEnabled: true },
  });
  const { name, measures, selectedMeasureIndex } = draft;
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
  const canSave =
    !auth.busy &&
    (auth.state.status === "guest" || auth.state.status === "disabled" || auth.state.status === "authenticated");
  useEffect(() => {
    // 身份变化或卸载后，旧保存仍可能在服务器完成，但不能再导航或覆盖当前草稿提示。
    return () => {
      saveGeneration.current += 1;
    };
  }, [identity, auth.busy]);

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
    if (locked.current || !canSave) return;
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
      if (!candidate.name) throw new Error("请输入练习名称。");
      candidate.exercise = parseRhythmExercise(candidate.exercise);
      const saved =
        initial
          ? source === "account" ? await updateAccountExercise(initial.id, candidate) : updateCustomExercise(initial.id, candidate)
          : source === "account" ? await saveAccountExercise(candidate) : saveCustomExercise(candidate);
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
                    value={name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft((previous) => ({ ...previous, name }));
                      setSaveError(null);
                    }}
                  />
                </label>
                <div
                  className="custom-editor-actions"
                  role="group"
                  aria-label="试听与保存"
                >
                  <RhythmPlayback
                    key={[bpm, measures.length].join(":")}
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
                    disabled={saving || !canSave}
                    onClick={() => void save()}
                  >
                    {saving ? <LoaderCircle className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" /> : <Save className="ui-icon ui-icon--action" aria-hidden="true" focusable="false" />}
                    {saving ? "正在保存…" : initial ? "保存修改" : "保存练习"}
                  </button>
                </div>
                {saveError && (
                  <p className="custom-save-error" role="alert">
                    {saveError}
                  </p>
                )}
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
