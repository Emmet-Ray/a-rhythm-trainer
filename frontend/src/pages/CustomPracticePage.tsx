import { lazy, Suspense, useRef, useState } from "react";
import { Link, useMatch, useParams } from "react-router";
import NotFoundPage from "./NotFoundPage";
import { validateRhythmExercise, type RhythmElement, type RhythmExercise } from "../rhythm/RhythmModel";
import type { RhythmEditorHandle } from "../practice/RhythmEditor";
import PracticeSettings from "../practice/PracticeSettings";
import RhythmPlayback from "../practice/RhythmPlayback";

// 选择训练方式时不加载 VexFlow；进入新建页面后才加载编辑器。
const RhythmEditor = lazy(() => import("../practice/RhythmEditor").then((module) => ({ default: module.RhythmEditor })));

// 自定义的开放范围不依赖预设题库；每个模式的草稿独立创建。
const customModes = [
  { id: "tapping", label: "击拍练习" },
  { id: "dictation", label: "节奏听写" },
] as const;
type CustomMode = (typeof customModes)[number]["id"];

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
  return (
    <>
      <title>{`自定义${label} · 节奏训练`}</title>
      <Link className="back-link" to="/custom">← 返回自定义练习</Link>
      <header className="page-heading practice-heading custom-list-heading">
        <div><p className="eyebrow">自定义练习</p><h1>{label}</h1></div>
        <Link className="custom-new-link" to={`/custom/${mode}/new`}>新建练习</Link>
      </header>
      {/* TODO：接入持久化后，读取并列出当前模式的已保存题目。 */}
      <p className="empty-questions">保存功能暂未开放，可以先新建并编辑练习。</p>
    </>
  );
}

const timeSignature: RhythmExercise["timeSignature"] = { beats: 4, beatType: 4 };

/**
 * 一次挂载对应一份未保存草稿。允许小节未填满，试听保留完整小节时长，不做判题。
 * 小节只从末尾增减，删除有内容的小节需确认；至少保留一节，选择始终在有效范围内。
 * 草稿只在本页内存中持有；保存目前仅做校验，不写入存储或跳转。
 */
function CustomExerciseEditor({ mode }: { mode: CustomMode }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [name, setName] = useState("");
  const [measures, setMeasures] = useState<RhythmElement[][]>(() => [[], []]);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const editorRef = useRef<RhythmEditorHandle>(null);

  function addMeasure() {
    setSaveError(null);
    setSaveMessage("");
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
    setSaveMessage("");
    setSelectedMeasureIndex((previous) => Math.min(previous, measures.length - 2));
    editorRef.current?.clearMessage();
  }

  function save() {
    setSaveError(null);
    setSaveMessage("");
    try {
      if (!name.trim()) throw new Error("请输入练习名称。");
      const candidate = { name: name.trim(), mode, exercise: {
        timeSignature, measures: measures.map((elements) => ({ elements })),
      } };
      validateRhythmExercise(candidate.exercise);
      // TODO：将 candidate 持久化；成功后才提示保存成功并返回当前模式的列表。
      // 当前不调用浏览器存储，不将候选题目加入列表，也不清空草稿。
      setSaveMessage("校验通过，保存功能尚未接入，草稿仍未保存。");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试。");
    }
  }

  return (
    <section className="custom-exercise-editor" aria-label="编辑自定义练习">
      <div className="practice-settings custom-settings">
        <label className="custom-name">
          <span>练习名称</span>
          <input value={name} onChange={(event) => { setName(event.target.value); setSaveError(null); setSaveMessage(""); }} />
        </label>
        <div className="custom-measure-count" role="group" aria-label="小节数量">
          <span>小节数量</span>
          <button type="button" aria-label="减少小节" disabled={measures.length === 1} onClick={removeMeasure}>−</button>
          <output aria-label="当前小节数量">{measures.length}</output>
          <button type="button" aria-label="增加小节" onClick={addMeasure}>+</button>
        </div>
        <span className="custom-time-signature">4/4 拍</span>
      </div>
      <p className="custom-draft-notice">暂未提供保存，离开或刷新页面后草稿会丢失。</p>
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
          setSaveMessage("");
          setMeasures((previous) => previous.map((measure, index) =>
            index === measureIndex ? elements : measure,
          ));
        }}
      />
      <div className="custom-save-actions">
        <button className="custom-save-button" type="button" onClick={save}>保存练习</button>
        {saveError && <p role="alert">{saveError}</p>}
        {saveMessage && <p role="status">{saveMessage}</p>}
      </div>
    </section>
  );
}
