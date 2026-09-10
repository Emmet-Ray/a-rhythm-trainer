import { lazy, Suspense, useRef, useState } from "react";
import { Link, useLocation, useMatch, useNavigate, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import type { RhythmEditorHandle } from "../practice/RhythmEditor";
import PracticeSettings from "../practice/PracticeSettings";
import RhythmPlayback from "../practice/RhythmPlayback";
import { listCustomExercises, saveCustomExercise, type CustomMode } from "../exercises/customExercises";

// 选择训练方式时不加载 VexFlow；进入新建页面后才加载编辑器。
const RhythmEditor = lazy(() => import("../practice/RhythmEditor").then((module) => ({ default: module.RhythmEditor })));

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;

export default function CustomPracticePage() {
  const { mode } = useParams();
  const isNew = useMatch("/custom/:mode/new") !== null;
  const selectedMode = customModes.find((item) => item.id === mode);
  if (mode !== undefined && !selectedMode) return <NotFoundPage />;

  if (selectedMode && isNew) {
    return (
      <>
        <title>{`新建${selectedMode.label} · 节奏训练`}</title>
        <Link className="back-link" to={`/custom/${selectedMode.id}`}>← 返回题目列表</Link>
        <header className="page-heading practice-heading">
          <p className="eyebrow">自定义练习 / {selectedMode.label}</p>
          <h1>新建练习</h1>
        </header>
        <Suspense fallback={<p className="loading-message" role="status">正在加载编辑器…</p>}>
          {/* 换模式即新草稿，不把一道题自动共享给两种训练方式。 */}
          <CustomExerciseEditor key={selectedMode.id} mode={selectedMode.id} />
        </Suspense>
      </>
    );
  }

  if (selectedMode) return <CustomExerciseList key={selectedMode.id} mode={selectedMode.id} label={selectedMode.label} />;

  return (
    <>
      <title>自定义练习 · 节奏训练</title>
      <header className="page-heading"><h1>自定义练习</h1></header>
      <nav className="option-strip" aria-label="内容来源">
        <Link to="/">预设练习</Link>
        <Link to="/random">随机练习</Link>
        <Link to="/custom" className="option-current" aria-current="page">自定义练习</Link>
      </nav>
      <section className="custom-mode-selection" aria-labelledby="custom-mode-heading">
        <h2 id="custom-mode-heading">选择训练方式</h2>
        <ul className="question-list">
          {customModes.map((item) => (
            <li key={item.id}>
              <Link className="question-link" to={`/custom/${item.id}`}>
                <h3>{item.label}</h3>
                <span className="question-action">查看题目 <span aria-hidden="true">→</span></span>
              </Link>
            </li>
          ))}
          <li className="custom-mode-unavailable">几何游戏 <small>未开放</small></li>
        </ul>
      </section>
    </>
  );
}

function CustomExerciseList({ mode, label }: { mode: CustomMode; label: string }) {
  const { state } = useLocation();
  function readExercises() {
    try {
      return { items: listCustomExercises(mode), error: null };
    } catch (error) {
      return { items: [], error: error instanceof Error ? error.message : "读取失败，请重试。" };
    }
  }
  const [result, setResult] = useState(readExercises);
  return (
    <>
      <title>{`自定义${label} · 节奏训练`}</title>
      <Link className="back-link" to="/custom">← 返回自定义练习</Link>
      <header className="page-heading practice-heading custom-list-heading">
        <div><p className="eyebrow">自定义练习</p><h1>{label}</h1></div>
        <Link className="custom-new-link" to={`/custom/${mode}/new`}>新建练习</Link>
      </header>
      <p className="custom-draft-notice">保存在当前浏览器，清除网站数据后会丢失。</p>
      {result.items.some((item) => item.id === state?.savedExerciseId) && <p role="status">已保存</p>}
      {result.error ? (
        <div className="custom-storage-error">
          <p role="alert">{result.error}</p>
          <button type="button" onClick={() => setResult(readExercises())}>重试读取</button>
        </div>
      ) : result.items.length === 0 ? <p className="empty-questions">暂无题目</p> : (
        <ul className="question-list" aria-label="已保存的自定义练习">
          {result.items.map((item) => (
            <li className="custom-saved-question" key={item.id}>
              <h2>{item.name}</h2>
              <span className="question-meta">4/4 拍 · {item.exercise.measures.length} 小节</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const timeSignature: RhythmExercise["timeSignature"] = { beats: 4, beatType: 4 };

/**
 * 一次挂载对应一份未保存草稿。允许小节未填满，试听保留完整小节时长，不做判题。
 * 小节只从末尾增减，删除有内容的小节需确认；至少保留一节，选择始终在有效范围内。
 * 草稿只在本页内存中持有；显式保存成功后返回所属模式列表，失败时保留草稿。
 */
function CustomExerciseEditor({ mode }: { mode: CustomMode }) {
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [measures, setMeasures] = useState<RhythmElement[][]>(() => [[], []]);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const editorRef = useRef<RhythmEditorHandle>(null);

  function addMeasure() {
    setSaveError(null);
    setMeasures((previous) => [...previous, []]);
    editorRef.current?.clearMessage();
  }

  function removeMeasure() {
    if (measures.length <= 1) return;
    const lastMeasure = measures[measures.length - 1];
    // 确认放在事件处理器中，而非 React 状态更新函数中，避免重复弹窗。
    if (lastMeasure.length > 0 && !window.confirm(
      `第 ${measures.length} 小节已有内容，确定删除这个小节吗？`,
    )) return;

    setMeasures((previous) => previous.slice(0, -1));
    setSaveError(null);
    setSelectedMeasureIndex((previous) => Math.min(previous, measures.length - 2));
    editorRef.current?.clearMessage();
  }

  function save() {
    setSaveError(null);
    try {
      const candidate = { name: name.trim(), mode, exercise: {
        timeSignature, measures: measures.map((elements) => ({ elements })),
      } };
      const saved = saveCustomExercise(candidate);
      // 写入成功才离开编辑页，卸载播放器会取消旧声音和异步启动。
      navigate(`/custom/${mode}`, { replace: true, state: { savedExerciseId: saved.id } });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试。");
    }
  }

  return (
    <section className="custom-exercise-editor" aria-label="编辑自定义练习">
      <div className="practice-settings custom-settings">
        <label className="custom-name">
          <span>练习名称</span>
          <input value={name} onChange={(event) => { setName(event.target.value); setSaveError(null); }} />
        </label>
        <div className="custom-measure-count" role="group" aria-label="小节数量">
          <span>小节数量</span>
          <button type="button" aria-label="减少小节" disabled={measures.length === 1} onClick={removeMeasure}>−</button>
          <output aria-label="当前小节数量">{measures.length}</output>
          <button type="button" aria-label="增加小节" onClick={addMeasure}>+</button>
        </div>
        <span className="custom-time-signature">4/4 拍</span>
      </div>
      <p className="custom-draft-notice">保存到当前浏览器；未保存时，离开或刷新页面后草稿会丢失。</p>
      <PracticeSettings>
        {({ bpm, metronomeEnabled }) => (
          <div className="custom-playback">
            {/* 速度与小节数改变时仅重建播放器；名称、谱面和选中状态保留。 */}
            <RhythmPlayback
              key={[bpm, measures.length].join(":")}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              timeSignature={timeSignature}
              options={[{ id: "draft", label: "试听", stopLabel: "停止", measures }]}
            />
          </div>
        )}
      </PracticeSettings>
      <RhythmEditor
        ref={editorRef}
        measures={measures}
        timeSignature={timeSignature}
        selectedMeasureIndex={selectedMeasureIndex}
        onSelectMeasure={setSelectedMeasureIndex}
        onChange={(measureIndex, elements) => {
          setSaveError(null);
          setMeasures((previous) => previous.map((measure, index) =>
            index === measureIndex ? elements : measure,
          ));
        }}
      />
      <div className="custom-save-actions">
        <button className="custom-save-button" type="button" onClick={save}>保存练习</button>
        {saveError && <p role="alert">{saveError}</p>}
      </div>
    </section>
  );
}
