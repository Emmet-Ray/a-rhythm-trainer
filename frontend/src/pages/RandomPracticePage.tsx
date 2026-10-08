import { ExerciseWorkbench } from "../practice/ExerciseWorkbench";
import { ActionError } from "../navigation/ActionError";
import { useAssistantPageContext } from "../assistant/assistantContext";
import { lazy, memo, Suspense, useEffect, useId, useRef, useState } from "react";
import { RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { PracticeHeading } from "../practice/PracticeHeading";
import { practiceShortcuts, usePracticeShortcuts } from "../practice/usePracticeShortcuts";
import { useBrowsingState, useVisitState } from "../navigation/usePageNavigation";
import { Navigate, useNavigate, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { generateRandomExercise, randomMaterials, defaultRandomMaterials, randomMeasureCounts, DEFAULT_RANDOM_MEASURE_COUNT, type RandomGenerationConfig } from "../exercises/randomExercises";
import type { RhythmExercise } from "../rhythm/RhythmModel";

// 进入对应模式后加载完整工作区。
const RhythmSymbol = lazy(() => import("../rhythm/notation/RhythmSymbol").then(module => ({ default: module.RhythmSymbol })));
const materialGroups = ["音符", "休止符", "节奏型"] as const;

// 材料定义不随勾选变化；静态 SVG 不必跟随每次配置更新重新排版。
const MaterialPreview = memo(function MaterialPreview({ material }: { material: typeof randomMaterials[number] }) {
  return <Suspense fallback={<span className="random-symbol-placeholder" aria-hidden="true" />}>
    {material.elements.length === 1
      ? <RhythmSymbol {...material.elements[0]} />
      : <RhythmSymbol kind="pattern" events={material.elements.filter(element => element.kind !== "triplet")} />}
  </Suspense>;
});

// 随机练习的开放范围独立于预设题库；这里只列出已有子页面的模式。
const randomModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;

export default function RandomPracticePage() {
  const { mode } = useParams();
  const [lastMode, setLastMode] = useBrowsingState("random:last-mode", "tapping");
  const selectedMode = randomModes.find(item => item.id === mode);
  useEffect(() => { if (selectedMode) setLastMode(selectedMode.id); }, [selectedMode, setLastMode]);
  if (mode === undefined) return <Navigate to={`/random/${lastMode}`} replace />;
  if (!selectedMode) return <NotFoundPage />;
  return <div className="random-page">
    <title>{`随机${selectedMode.label} · 节奏训练`}</title>
    <RandomExerciseWorkspace key={selectedMode.id} mode={selectedMode.id} />
  </div>;
}

function RandomExerciseWorkspace({ mode }: { mode: RandomGenerationConfig["mode"] }) {
  const navigate = useNavigate();
  const measureCountName = useId();
  const drawerTitleId = useId();
  const rangeTitleId = useId();
  const rangeErrorId = useId();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [config, setConfig] = useBrowsingState<RandomGenerationConfig>(`random:${mode}:config`, { mode, materials: defaultRandomMaterials, measureCount: DEFAULT_RANDOM_MEASURE_COUNT });
  const [generated, setGenerated] = useVisitState<{ id: string; exercise: RhythmExercise | null }>(`random:${mode}:question`, () => ({
    id: crypto.randomUUID(),
    exercise: config.materials.length > 0 ? generateRandomExercise(config) : null,
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const restoreSettingsFocus = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const rangeError = config.materials.length === 0 ? "至少选择一个练习范围" : null;

  useAssistantPageContext(editing ? null : { page: "random_practice", description: "随机练习；生成设置是下一次换题的条件，不一定是当前题目的生成条件。",
    state: { mode, settingsOpen, generationSettings: { measureCount: config.measureCount,
      materials: randomMaterials.filter(item => config.materials.includes(item.id)).map(({ id, label, group }) => ({ id, label, group })) },
      exerciseAvailable: generated.exercise !== null, configurationError: rangeError ?? error } });

  useEffect(() => {
    if (!settingsOpen) {
      // 关闭设置后将键盘焦点还给题头入口。
      if (restoreSettingsFocus.current) {
        settingsButtonRef.current?.focus({ preventScroll: true });
        restoreSettingsFocus.current = false;
      }
      return;
    }
    const dialog = drawerRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [settingsOpen, generated.id]);

  function closeSettings() {
    restoreSettingsFocus.current = true;
    drawerRef.current?.close();
    setSettingsOpen(false);
    settingsButtonRef.current?.focus({ preventScroll: true });
  }

  function generate() {
    try {
      // 手动换题只在事件中执行；先生成成功，再替换题目及作答绑定。
      const exercise = generateRandomExercise(config);
      setGenerated({ id: crypto.randomUUID(), exercise });
      setError(null);
      if (settingsOpen) closeSettings();
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
      setSettingsOpen(true);
    }
  }

  usePracticeShortcuts({ next: !editing && !busy && config.materials.length > 0 ? generate : undefined });

  return (
    <>
      <dialog ref={drawerRef} className="design-system random-settings-drawer" aria-labelledby={drawerTitleId}
        onCancel={event => { event.preventDefault(); closeSettings(); }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSettings();
        }}>
      <header className="random-settings-heading">
        <h2 id={drawerTitleId}>生成设置</h2>
        <button type="button" aria-label="关闭生成设置" title="关闭生成设置" onClick={closeSettings}><X className="ui-icon ui-icon--control" aria-hidden="true" focusable="false" /></button>
      </header>
      <section className="design-system random-generation" aria-label="生成配置">
        <div className="random-config">
            <fieldset className="measure-count">
              <legend>小节数</legend>
              <div className="measure-count-options">
                {randomMeasureCounts.map(count => (
                  <label key={count}>
                    <input type="radio" name={measureCountName} value={count}
                      checked={config.measureCount === count}
                      onChange={() => {
                        setConfig(previous => ({ ...previous, measureCount: count }));
                        setError(null);
                      }} />
                    <span>{count} 小节</span>
                  </label>
                ))}
              </div>
            </fieldset>
          <div className="random-range-heading">
            <h3 id={rangeTitleId}>练习范围</h3>
            <p id={rangeErrorId} className="random-range-error" aria-live="polite">{rangeError}</p>
          </div>
          <div className="random-range-scroll" role="group" aria-labelledby={rangeTitleId}
            aria-describedby={rangeError ? rangeErrorId : undefined}>
            {materialGroups.map(group => <fieldset key={group} className="random-material-group" data-group={group}>
              <legend>{group}</legend>
              <div className="random-material-options">
              {randomMaterials.filter(material => material.group === group).map(material => (
                <label key={material.id}>
                  <input type="checkbox" checked={config.materials.includes(material.id)} onChange={event => {
                    const checked = event.target.checked;
                    setConfig(previous => ({ ...previous, materials: checked
                      ? [...previous.materials, material.id]
                      : previous.materials.filter(id => id !== material.id) }));
                    setError(null);
                  }} />
                  <MaterialPreview material={material} />
                  <span>{material.label}</span>
                </label>
              ))}
              </div>
            </fieldset>)}
          </div>
        </div>
      </section>
        {settingsOpen && error && <ActionError message={error} />}
      </dialog>
        {generated.exercise && <ExerciseWorkbench key={generated.id}
          initial={{ name: "随机练习", mode, exercise: generated.exercise }}
          origin={{ source: "random", exerciseId: generated.id, title: "随机练习" }} onBusyChange={setBusy} onEditingChange={setEditing}>
          {view => <>
            <div className="design-system practice-page">
              <PracticeHeading title={view.title} history={view.editing ? undefined : view.history}>
                {!view.editing && <>
                  <div className="topic-modes workspace-mode-switch" role="group" aria-label="训练方式">
                    {randomModes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id}
                      disabled={busy} onClick={() => { if (mode !== item.id) navigate(`/random/${item.id}`); }}>{item.label}</button>)}
                  </div>
                  <div className="practice-question-actions text-actions">
                    <button type="button" title={`换一题（${practiceShortcuts.next.key}）`} aria-keyshortcuts={practiceShortcuts.next.key} disabled={busy || config.materials.length === 0} onClick={generate}><RefreshCw className="ui-icon" aria-hidden="true" focusable="false" />换一题</button>
                    <button ref={settingsButtonRef} type="button" disabled={busy} aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><SlidersHorizontal className="ui-icon" aria-hidden="true" focusable="false" />生成设置</button>
                  </div>
                </>}
                {view.editAction}
              </PracticeHeading>
            </div>
            <div className="design-system">{view.content}</div>
          </>}
        </ExerciseWorkbench>}
        {!generated.exercise && <div className="design-system practice-page"><PracticeHeading title="随机练习" />
          <button type="button" onClick={() => setSettingsOpen(true)}>生成设置</button></div>}

    </>
  );
}
