import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LoaderCircle, Minus, Plus, Save } from "lucide-react";
import { ActionError } from "../navigation/ActionError";
import { SuccessToast } from "../navigation/SuccessToast";
import { UnsavedChanges } from "../navigation/UnsavedChanges";
import { useVisitState } from "../navigation/usePageNavigation";
import { useAssistantExerciseTarget, useAssistantPageSection } from "../assistant/assistantContext";
import type { GeneratedExercise } from "../exercises/GeneratedExercise";
import type { CustomExercise, ExerciseDraft } from "../exercises/customExercises";
import { parseRhythmExercise, expandRhythmElements, TICKS_PER_QUARTER, type RhythmElement, type RhythmExercise } from "../rhythm/RhythmModel";
import { editorModule } from "./practiceModules";
import type { RhythmEditorHandle } from "./RhythmEditor";
import PracticeSettings, { type PracticeSettingsValue } from "./PracticeSettings";
import RhythmPlayback from "./RhythmPlayback";
import PracticeFrame from "./PracticeFrame";
import PracticeCue from "./PracticeCue";
const RhythmEditor = editorModule.Component;

const timeSignature: RhythmExercise["timeSignature"] = {
  beats: 4,
  beatType: 4,
};

/**
 * 一次历史访问及身份对应一份未保存草稿。允许小节未填满，试听保留完整小节时长，不做判题。
 * 小节只从末尾增减，删除有内容的小节需确认；至少保留一节，选择始终在有效范围内。
 * 返回原记录时恢复草稿，新建访问不复用；保存成功只清除提交版本，失败时保留。
 */
export default function ExerciseEditor({ initial, scope, onSave, onSaved, onCancel, registerGuard, children }: {
  children: (view: { title: ReactNode; actions: ReactNode; content: ReactNode }) => ReactNode;
  initial: ExerciseDraft;
  scope: string;
  onSave: (draft: ExerciseDraft) => Promise<CustomExercise>;
  onSaved: (item: CustomExercise) => void;
  onCancel: () => void;
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const { mode } = initial;
  const nameErrorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [draft, setDraft, forgetDraft] = useVisitState<{
    name: string;
    measures: RhythmElement[][];
    selectedMeasureIndex: number;
  }>(`editor:${scope}:draft`, {
    name: initial.name,
    measures: structuredClone(initial.exercise.measures.map(measure => measure.elements)),
    selectedMeasureIndex: 0,
  });
  const [settings, rememberSettings] = useVisitState<PracticeSettingsValue>(`practice:${scope}:settings`, { bpm: 60, metronomeEnabled: true });
  const { name, measures, selectedMeasureIndex } = draft;
  useAssistantPageSection("editor", {
    page: "exercise_editor",
    description: "题目编辑视图，正在编辑未保存草稿；小节可能未填满，selectedMeasureIndex 从 0 开始。",
    state: { mode, name,
      timeSignature: { beats: 4, beatType: 4 }, measure_count: measures.length,
      measures: measures.map(elements => ({ elements })), selectedMeasureIndex,
      bpm: settings.bpm, metronomeEnabled: settings.metronomeEnabled },
  });
  const [settled, setSettled] = useState(false);
  const [savedContent, setSavedContent] = useState(() => ({
    name: initial.name,
    measures: initial.exercise.measures.map(measure => measure.elements),
  }));
  const dirty = !settled && (name !== savedContent.name
    || JSON.stringify(measures) !== JSON.stringify(savedContent.measures));
  const editorRef = useRef<RhythmEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const saveGeneration = useRef(0);
  const discard = useCallback(() => {
    if (locked.current) return false;
    if (dirty && !window.confirm("修改尚未保存，确定放弃修改吗？")) return false;
    forgetDraft(draft);
    // 取消新建可能紧接着离开页面，先解除本草稿的路由保护，避免重复确认。
    flushSync(() => setSettled(true));
    return true;
  }, [dirty, draft, forgetDraft]);
  useEffect(() => {
    registerGuard(discard);
    return () => registerGuard(null);
  }, [discard, registerGuard]);


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
    if (dirty && !window.confirm("替换当前未保存的练习内容？")) return false;
    setDraft(previous => ({ ...previous, name: proposal.title,
      measures: structuredClone(proposal.exercise.measures.map(measure => measure.elements)),
      selectedMeasureIndex: 0 }));
    setAssistantRevision(value => value + 1);
    setAssistantApplied(true);
    setNameError(false);
    setSettled(false);
    setSaveError(null);
    editorRef.current?.clearMessage();
    return true;
  }, [dirty, setDraft]);
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
      const saved = await onSave(candidate);
      forgetDraft(draft);
      if (generation !== saveGeneration.current) return;
      flushSync(() => {
        setSavedContent({ name: saved.name, measures: saved.exercise.measures.map(measure => measure.elements) });
        setSettled(true);
      });
      onSaved(saved);
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

  const title = <span className="exercise-name-field">
    <input ref={nameInput} aria-label="练习名称" placeholder="练习名称" disabled={saving}
      aria-invalid={nameError || undefined} aria-describedby={nameError ? nameErrorId : undefined}
      value={name} onChange={event => {
        setDraft(previous => ({ ...previous, name: event.target.value }));
        setSaveError(null); setNameError(false);
      }} />
    {nameError && <span id={nameErrorId} className="custom-name-error" role="alert">请输入练习名称</span>}
  </span>;
  const actions = <div className="custom-editor-actions" role="group" aria-label="保存与取消">
    <button type="button" disabled={saving} onClick={() => { if (discard()) onCancel(); }}>取消</button>
    <button className="custom-save-button" type="button" disabled={saving} onClick={() => void save()}>
      {saving ? <LoaderCircle className="ui-icon" aria-hidden="true" focusable="false" /> : <Save className="ui-icon" aria-hidden="true" focusable="false" />}
      {saving ? "正在保存…" : "保存练习"}
    </button>
  </div>;
  const content = <section className="exercise-editor" data-mode={mode} aria-label="编辑练习">
    <fieldset className="custom-exercise-fields" disabled={saving}>
      <PracticeSettings layout="sidebar" initialValue={settings} onChange={rememberSettings}>
        {({ bpm, metronomeEnabled }, settingsPanel) => <PracticeFrame
          toolbar={<div className="editor-measures">
            <div className="draft-measure-navigation" role="group" aria-label="小节导航">
              <span>小节</span>
              {measures.map((_, index) => <button key={index} type="button" aria-label={`跳到小节 ${index + 1}`}
                aria-pressed={index === selectedMeasureIndex}
                onClick={() => setDraft(previous => ({ ...previous, selectedMeasureIndex: index }))}>{index + 1}</button>)}
            </div>
            <div className="measure-actions" role="group" aria-label="小节数量">
              <button type="button" aria-label="减少小节" title="删除末尾小节" disabled={measures.length === 1} onClick={removeMeasure}><Minus className="ui-icon" aria-hidden="true" focusable="false" /></button>
              <button type="button" aria-label="增加小节" title="增加小节" onClick={addMeasure}><Plus className="ui-icon" aria-hidden="true" focusable="false" /></button>
            </div>
          </div>}
          settingsPanel={<div className="editor-playback">
            <RhythmPlayback key={[bpm, measures.length, assistantRevision].join(":")}
              bpm={bpm} metronomeEnabled={metronomeEnabled} timeSignature={timeSignature}
              options={[{ id: "draft", label: "试听", stopLabel: "停止", measures }]}
              onCountInChange={setCountdown} />
            {settingsPanel}
          </div>}>
          {assistantApplied && <SuccessToast key={assistantRevision} message="已放入，可继续编辑" />}
          {saveError && <ActionError message={saveError} onRetry={() => void save()} />}
          <RhythmEditor ref={editorRef} scoreLayout={mode === "tapping" ? "practice" : "draft"}
            showNavigation={false}
            scoreOverlay={countdown !== null ? <PracticeCue countdown={countdown} /> : null}
            measures={measures} timeSignature={timeSignature} selectedMeasureIndex={selectedMeasureIndex}
            onSelectMeasure={selectedMeasureIndex => setDraft(previous => ({ ...previous, selectedMeasureIndex }))}
            onChange={(measureIndex, elements) => {
              setSaveError(null);
              setDraft(previous => ({ ...previous,
                measures: previous.measures.map((measure, index) => index === measureIndex ? elements : measure) }));
            }} />
        </PracticeFrame>}
      </PracticeSettings>
    </fieldset>
  </section>;
  return <><UnsavedChanges dirty={dirty || (saving && !settled)} />{children({ title, actions, content })}</>;
}
