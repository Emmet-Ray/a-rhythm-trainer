import { lazy, memo, Suspense, useEffect, useId, useRef, useState } from "react";
import { PracticeHeading } from "../practice/PracticeHeading";
import { useVisitState } from "../navigation/usePageNavigation";
import { Link, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { generateRandomExercise, randomMaterials, defaultRandomMaterials, randomMeasureCounts, DEFAULT_RANDOM_MEASURE_COUNT, type RandomGenerationConfig } from "../exercises/randomExercises";
import type { RhythmExercise } from "../rhythm/RhythmModel";

// 进入对应模式后加载完整工作区，尚未生成时显示空状态。
const PracticeWorkspace = lazy(() => import("../practice/PracticeWorkspace"));
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
  const selectedMode = randomModes.find(item => item.id === mode);
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (selectedMode) {
    return (
      <div className="random-page">
        <title>{`随机${selectedMode.label} · 节奏训练`}</title>
        <div className="design-system practice-page">
        <PracticeHeading backTo="/random" backLabel="随机练习" />
        </div>
        <RandomExerciseWorkspace key={selectedMode.id} mode={selectedMode.id} />
      </div>
    );
  }

  return (
    <div className="design-system random-page random-index">
      <title>随机练习 · 节奏训练</title>
      <header className="page-heading"><h1>随机练习</h1></header>
      <section className="random-mode-selection" aria-labelledby="random-mode-heading">
        <h2 id="random-mode-heading">选择训练方式</h2>
        <ul className="question-list">
          {randomModes.map(item => (
            <li key={item.id}>
              <Link className="question-link" to={`/random/${item.id}`}>
                <h3>{item.label}</h3>
                <span className="question-action">配置规则 <span aria-hidden="true">→</span></span>
              </Link>
            </li>
          ))}
          <li>
            <div className="question-link random-mode-unavailable" aria-disabled="true">
              <h3>几何游戏</h3>
              <span className="question-action">未开放</span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

function RandomExerciseWorkspace({ mode }: { mode: RandomGenerationConfig["mode"] }) {
  const measureCountName = useId();
  const drawerTitleId = useId();
  const rangeTitleId = useId();
  const rangeErrorId = useId();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [config, setConfig] = useVisitState<RandomGenerationConfig>(`random:${mode}:config`, { mode, materials: defaultRandomMaterials, measureCount: DEFAULT_RANDOM_MEASURE_COUNT });
  const [generated, setGenerated] = useVisitState<{ id: number; exercise: RhythmExercise } | null>(`random:${mode}:question`, null);
  const [settingsOpen, setSettingsOpen] = useState(generated === null);
  const [error, setError] = useState<string | null>(null);
  const rangeError = config.materials.length === 0 ? "至少选择一个练习范围。" : error;

  useEffect(() => {
    if (!settingsOpen) {
      // 生成会重建操作栏，提交后的焦点应落到新按钮，而非已卸载的旧节点。
      settingsButtonRef.current?.focus({ preventScroll: true });
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
  }, [settingsOpen, generated?.id]);

  function closeSettings() {
    drawerRef.current?.close();
    setSettingsOpen(false);
    settingsButtonRef.current?.focus({ preventScroll: true });
  }

  function generate() {
    try {
      // 生成只在事件中执行，不放进渲染或 state updater，避免重复执行。
      const exercise = generateRandomExercise(config);
      setGenerated(previous => ({ id: (previous?.id ?? 0) + 1, exercise }));
      setError(null);
      closeSettings();
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
      setSettingsOpen(true);
    }
  }

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
        <button type="button" aria-label="关闭生成设置" onClick={closeSettings}>×</button>
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
            {rangeError && <p id={rangeErrorId} role="alert">{rangeError}</p>}
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
      </dialog>
        <Suspense fallback={<p className="loading-message" role="status" data-navigation-pending>正在加载练习…</p>}>
          <PracticeWorkspace exerciseKey={generated?.id ?? 0} exercise={generated?.exercise ?? null} mode={mode}
            extraActions={busy => (
              <div className="random-toolbar-actions">
                <button type="button" disabled={busy || config.materials.length === 0} onClick={generate}>{generated ? "换一题" : "生成题目"}</button>
                <button ref={settingsButtonRef} className="random-settings-trigger" type="button" disabled={busy}
                  aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>生成设置</button>
              </div>
            )} />
        </Suspense>
    </>
  );
}
