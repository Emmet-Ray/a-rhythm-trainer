import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
} from "react-router";
import NotFoundPage from "./NotFoundPage";
import { ReturnLink } from "../navigation/PageNavigation";
import { useVisitState } from "../navigation/usePageNavigation";
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
  type AccountExerciseSummary,
} from "../api/customExercises";
import type { RhythmEditorHandle } from "../practice/RhythmEditor";
import PracticeSettings, { type PracticeSettingsValue } from "../practice/PracticeSettings";
import RhythmPlayback from "../practice/RhythmPlayback";
import {
  listCustomExercises,
  saveCustomExercise,
  type CustomExercise,
  type CustomMode,
} from "../exercises/customExercises";

// 选择训练方式时不加载 VexFlow；进入新建页面后才加载编辑器。
const RhythmEditor = lazy(() =>
  import("../practice/RhythmEditor").then((module) => ({
    default: module.RhythmEditor,
  })),
);
const PracticeWorkspace = lazy(() => import("../practice/PracticeWorkspace"));

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;

type Auth = ReturnType<typeof useAuth>;
type Source = "local" | "account";

export default function CustomPracticePage({ auth }: { auth: Auth }) {
  const { mode, exerciseId } = useParams();
  const isNew = useMatch("/custom/:mode/new") !== null;
  const isAccount = useMatch("/custom/:mode/account/:exerciseId") !== null;
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
          ← 返回自定义练习
        </ReturnLink>
        <p role="status" data-navigation-pending={auth.state.status === "checking" || auth.busy ? true : undefined}>
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
        <ReturnLink className="back-link" to={`/custom/${selectedMode.id}`}>
          ← 返回题目列表
        </ReturnLink>
        <header className="page-heading practice-heading">
          <p className="eyebrow">自定义练习 / {selectedMode.label}</p>
          <h1>新建练习</h1>
        </header>
        <Suspense
          fallback={
            <p className="loading-message" role="status" data-navigation-pending>
              正在加载编辑器…
            </p>
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
          <p>请登录后查看账号练习。</p>
          <Link to="/login">登录</Link> ·{" "}
          <ReturnLink to={`/custom/${selectedMode.id}`}>返回题目列表</ReturnLink>
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
        <ul className="question-list">
          {customModes.map((item) => (
            <li key={item.id}>
              <Link className="question-link" to={`/custom/${item.id}`}>
                <h3>{item.label}</h3>
                <span className="question-action">
                  查看题目 <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <div
              className="question-link custom-mode-unavailable"
              aria-disabled="true"
            >
              <h3>几何游戏</h3>
              <span className="question-action">未开放</span>
            </div>
          </li>
        </ul>
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
  const [offset, setOffset] = useVisitState(`custom:${identity}:${mode}:offset`, 0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (source !== "account") return;
    const controller = new AbortController();
    void listAccountExercises(mode, { offset, signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted && offset > 0 && page.items.length === 0) {
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
      <ReturnLink className="back-link" to="/custom">
        ← 返回自定义练习
      </ReturnLink>
      <header className="page-heading practice-heading custom-list-heading">
        <div>
          <p className="eyebrow">自定义练习</p>
          <h1>{label}</h1>
        </div>
        <Link className="custom-new-link" to={`/custom/${mode}/new`}>
          新建练习
        </Link>
      </header>
      <p className="custom-draft-notice">
        {source === "account"
          ? "我的练习 · 保存在当前账号"
          : "本地练习 · 保存在当前浏览器，清除网站数据后会丢失。"}
      </p>
      {result.items.some((item) => item.id === state?.savedExerciseId) && (
        <p className="custom-saved-notice" role="status">
          已保存
        </p>
      )}
      {result.error ? (
        <div className="custom-storage-error">
          <p role="alert">{result.error}</p>
          <button type="button" onClick={() => reload()}>
            重试读取
          </button>
        </div>
      ) : result.loading ? (
        <p role="status" data-navigation-pending>正在读取练习…</p>
      ) : result.items.length === 0 ? (
        <p className="empty-questions">暂无题目</p>
      ) : (
        <ul className="question-list" aria-label="已保存的自定义练习">
          {result.items.map((item) => (
            <li className="custom-saved-question" key={item.id}>
              <Link
                className="question-link"
                to={`/custom/${mode}/${source === "account" ? "account/" : ""}${encodeURIComponent(item.id)}`}
              >
                <div>
                  <h2>{item.name}</h2>
                  {"exercise" in item && (
                    <span className="question-meta">
                      4/4 拍 · {item.exercise.measures.length} 小节
                    </span>
                  )}
                </div>
                <span className="question-action">
                  开始练习 <span aria-hidden="true">→</span>
                </span>
              </Link>
              {/* TODO: 接入该题目的编辑入口，载入草稿并按原 ID 保存修改。 */}
              <button type="button" disabled>
                编辑 <small>未开放</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {source === "account" && (
        <nav aria-label="题目分页">
          <button
            type="button"
            disabled={result.loading || offset === 0}
            onClick={() => reload(Math.max(0, offset - 50))}
          >
            上一页
          </button>
          <span> 第 {offset / 50 + 1} 页 </span>
          <button
            type="button"
            disabled={
              result.loading || !!result.error || result.items.length < 50
            }
            onClick={() => reload(offset + 50)}
          >
            下一页
          </button>
        </nav>
      )}
    </div>
  );
}

function CustomExercisePractice({
  mode,
  label,
  exerciseId,
  source,
  identity,
}: {
  mode: CustomMode;
  label: string;
  exerciseId: string;
  source: Source;
  identity: string;
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
    <div className="design-system practice-page custom-detail">
      <title>{`${result.item?.name ?? "自定义练习"} · ${label}`}</title>
      <ReturnLink className="back-link" to={`/custom/${mode}`}>
        ← 返回题目列表
      </ReturnLink>
      <header className="page-heading practice-heading">
        <p className="eyebrow">
          {source === "account" ? "我的练习" : "本地练习"} / {label}
        </p>
        <h1>
          {result.item?.name ??
            (result.loading
              ? "正在读取练习…"
              : result.error
                ? "无法读取练习"
                : "未找到该练习")}
        </h1>
      </header>
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
        <p role="status" data-navigation-pending>正在读取练习…</p>
      ) : result.item ? (
        <Suspense
          fallback={
            <p className="loading-message" role="status" data-navigation-pending>
              正在加载练习…
            </p>
          }
        >
          <PracticeWorkspace
            recoveryScope={`custom:${identity}:${source}:${mode}:${result.item.id}`}
            exercise={result.item.exercise}
            mode={mode}
            exerciseKey={result.item.id}
          />
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
}: {
  mode: CustomMode;
  auth: Auth;
  identity: string;
}) {
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft, forgetDraft] = useVisitState<{
    name: string;
    measures: RhythmElement[][];
    selectedMeasureIndex: number;
    settings: PracticeSettingsValue;
  }>(`custom:${identity}:${mode}:draft`, {
    name: "", measures: [[], []], selectedMeasureIndex: 0,
    settings: { bpm: 60, metronomeEnabled: true },
  });
  const { name, measures, selectedMeasureIndex } = draft;
  const rememberSettings = useCallback((settings: PracticeSettingsValue) => {
    setDraft(previous => ({ ...previous, settings }));
  }, [setDraft]);
  const editorRef = useRef<RhythmEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const saveGeneration = useRef(0);
  const canSave =
    !auth.busy &&
    (auth.state.status === "guest" || auth.state.status === "authenticated");
  useEffect(() => {
    // 身份变化或卸载后，旧保存仍可能在服务器完成，但不能再导航或覆盖当前草稿提示。
    return () => {
      saveGeneration.current += 1;
    };
  }, [identity, auth.busy]);

  function addMeasure() {
    setSaveError(null);
    setDraft(previous => ({ ...previous, measures: [...previous.measures, []] }));
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

    setDraft(previous => ({
      ...previous,
      measures: previous.measures.slice(0, -1),
      selectedMeasureIndex: Math.min(previous.selectedMeasureIndex, previous.measures.length - 2),
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
        auth.state.status === "authenticated"
          ? await saveAccountExercise(candidate)
          : saveCustomExercise(candidate);
      // 即使已离开，确认保存成功也清除原提交快照；后来修改的新版本不会被清除。
      forgetDraft(draft);
      if (generation !== saveGeneration.current) return;
      // 写入成功才离开编辑页，卸载播放器会取消旧声音和异步启动。
      navigate(`/custom/${mode}`, {
        replace: true,
        state: { savedExerciseId: saved.id },
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
    <section className="custom-exercise-editor" aria-label="编辑自定义练习">
      <fieldset className="custom-exercise-fields" disabled={saving}>
        <div className="custom-settings">
          <label className="custom-name">
            <span>练习名称</span>
            <input
              value={name}
              onChange={(event) => {
                const name = event.target.value;
                setDraft(previous => ({ ...previous, name }));
                setSaveError(null);
              }}
            />
          </label>
          <div
            className="custom-measure-count"
            role="group"
            aria-label="小节数量"
          >
            <span>小节数量</span>
            <button
              type="button"
              aria-label="减少小节"
              disabled={measures.length === 1}
              onClick={removeMeasure}
            >
              −
            </button>
            <output aria-label="当前小节数量">{measures.length}</output>
            <button type="button" aria-label="增加小节" onClick={addMeasure}>
              +
            </button>
          </div>
          <span className="custom-time-signature">4/4 拍</span>
        </div>
        <PracticeSettings initialValue={draft.settings} onChange={rememberSettings}>
          {({ bpm, metronomeEnabled }) => (
            <div className="custom-playback">
              {/* 速度与小节数改变时仅重建播放器；名称、谱面和选中状态保留。 */}
              <RhythmPlayback
                key={[bpm, measures.length].join(":")}
                bpm={bpm}
                metronomeEnabled={metronomeEnabled}
                timeSignature={timeSignature}
                options={[
                  { id: "draft", label: "试听", stopLabel: "停止", measures },
                ]}
              />
            </div>
          )}
        </PracticeSettings>
        <RhythmEditor
          ref={editorRef}
          measures={measures}
          timeSignature={timeSignature}
          selectedMeasureIndex={selectedMeasureIndex}
          onSelectMeasure={selectedMeasureIndex => setDraft(previous => ({ ...previous, selectedMeasureIndex }))}
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
        <div className="custom-save-actions">
          <button
            className="custom-save-button"
            type="button"
            disabled={saving || !canSave}
            onClick={() => void save()}
          >
            {saving ? "正在保存…" : "保存练习"}
          </button>
          {saveError && <p role="alert">{saveError}</p>}
        </div>
      </fieldset>
    </section>
  );
}
