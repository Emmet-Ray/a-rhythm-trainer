import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import {
  expandRhythmElements,
  rhythmEventToDurationInQuarterNotes,
  TICKS_PER_QUARTER,
  type RhythmElement,
  type RhythmEvent,
  type RhythmExercise,
} from "../rhythm/RhythmModel";
import { RhythmDraftScore } from "../rhythm/notation/RhythmDraftScore";
import { RhythmSymbol } from "../rhythm/notation/RhythmSymbol";
import { appendRhythmInput, rhythmInputPatterns } from "./RhythmEditorInput";

// 输入按钮与题目支持检查共用这一列表，避免出现题目可验证却无法填写的情况。
const eventOptions = [
  { kind: "note", noteValue: "whole", label: "全音符" },
  { kind: "note", noteValue: "half", label: "二分音符" },
  { kind: "note", noteValue: "quarter", label: "四分音符" },
  { kind: "note", noteValue: "eighth", label: "八分音符" },
  { kind: "note", noteValue: "sixteenth", label: "十六分音符" },
  { kind: "rest", noteValue: "whole", label: "全休止符" },
  { kind: "rest", noteValue: "half", label: "二分休止符" },
  { kind: "rest", noteValue: "quarter", label: "四分休止符" },
  { kind: "rest", noteValue: "eighth", label: "八分休止符" },
  { kind: "rest", noteValue: "sixteenth", label: "十六分休止符" },
] as const;

// 当前编辑器只开放四分、八分音符的附点；输入和能力检查遵守相同规则。
function canToggleDot(event: RhythmElement): event is RhythmEvent {
  return (
    event.kind === "note" &&
    (event.noteValue === "quarter" || event.noteValue === "eighth")
  );
}

/** 仅检查是否能用当前输入工具写出这些元素，不要求草稿已填满小节。 */
// eslint-disable-next-line react-refresh/only-export-components -- 输入能力与编辑器共置，供题目支持检查和测试使用。
export function canEditRhythmElements(
  elements: readonly RhythmElement[],
): boolean {
  return elements.every((event) =>
    event.kind === "triplet"
      ? event.notes.length === 3 &&
        event.notes.every(
          (note) =>
            note.kind === "note" &&
            note.noteValue === "eighth" &&
            (note.dots ?? 0) === 0,
        )
      : (event.kind === "note" || event.kind === "rest") &&
        eventOptions.some(
          (option) =>
            option.kind === event.kind && option.noteValue === event.noteValue,
        ) &&
        ((event.dots ?? 0) === 0 || (event.dots === 1 && canToggleDot(event))),
  );
}

type RhythmEditorProps = {
  ref?: Ref<RhythmEditorHandle>;
  emptyContent?: ReactNode;
  /** 在原谱面位置展示只读内容；草稿保持挂载，编辑工具隐藏但保留占位。 */
  preview?: ReactNode;
  scoreOverlay?: ReactNode;
  measureFeedback?: readonly ReactNode[];
  measures: readonly (readonly RhythmElement[])[];
  timeSignature: RhythmExercise["timeSignature"];
  selectedMeasureIndex: number;
  onSelectMeasure: (index: number) => void;
  onChange: (measureIndex: number, elements: RhythmElement[]) => void;
};

export type RhythmEditorHandle = {
  /** 调用方执行验证或保存后，可清除编辑提示，不改变草稿和选择。 */
  clearMessage: () => void;
};

/**
 * 受控的节奏草稿编辑器：允许空小节和欠拍，拒绝超过小节容量的修改。
 * 每次成功修改只回传对应小节的新元素，不修改输入；三连音按整组添加和删除。
 * 草稿、选中小节由调用方持有；编辑器不负责播放、判题、持久化或标准答案。
 */
export function RhythmEditor({
  ref,
  emptyContent,
  preview,
  scoreOverlay,
  measureFeedback,
  measures,
  timeSignature,
  selectedMeasureIndex,
  onSelectMeasure,
  onChange,
}: RhythmEditorProps) {
  const measureBeats = timeSignature.beats * (4 / timeSignature.beatType);
  const [addEventMessage, setAddEventMessage] = useState("");
  useImperativeHandle(
    ref,
    () => ({ clearMessage: () => setAddEventMessage("") }),
    [],
  );
  const hasSelectedMeasure = measures[selectedMeasureIndex] !== undefined;
  const lastEvent = measures[selectedMeasureIndex]?.at(-1);
  const canToggleLastDot = lastEvent !== undefined && canToggleDot(lastEvent);
  const lastHasDot = lastEvent?.kind !== "triplet" && lastEvent?.dots === 1;
  const usedTicks = expandRhythmElements(
    measures[selectedMeasureIndex] ?? [],
  ).durationTicks;

  function addElements(input: readonly RhythmElement[]) {
    if (!hasSelectedMeasure) return;
    const nextElements = appendRhythmInput(measures[selectedMeasureIndex], input, timeSignature);
    if (!nextElements) {
      setAddEventMessage("添加这个符号会超出当前小节允许的拍数。");
      return;
    }

    setAddEventMessage("");
    onChange(selectedMeasureIndex, nextElements);
  }

  function addElement(element: RhythmElement) {
    addElements([element]);
  }

  function toggleLastDot() {
    if (!lastEvent || !canToggleDot(lastEvent)) return;
    const updatedEvent: RhythmEvent = {
      ...lastEvent,
      dots: lastEvent.dots === 1 ? 0 : 1,
    };
    const usedBeats = usedTicks / TICKS_PER_QUARTER;
    const updatedBeats =
      usedBeats -
      rhythmEventToDurationInQuarterNotes(lastEvent) +
      rhythmEventToDurationInQuarterNotes(updatedEvent);
    if (updatedBeats > measureBeats) {
      setAddEventMessage("添加附点会超出当前小节允许的拍数。");
      return;
    }

    setAddEventMessage("");
    onChange(selectedMeasureIndex, [
      ...measures[selectedMeasureIndex].slice(0, -1),
      updatedEvent,
    ]);
  }

  function removeLastEvent() {
    if (!hasSelectedMeasure || measures[selectedMeasureIndex].length === 0)
      return;
    setAddEventMessage("");
    onChange(selectedMeasureIndex, measures[selectedMeasureIndex].slice(0, -1));
  }

  function clearSelectedMeasure() {
    if (!hasSelectedMeasure || measures[selectedMeasureIndex].length === 0)
      return;
    setAddEventMessage("");
    onChange(selectedMeasureIndex, []);
  }

  return (
    <div className="rhythm-editor design-system">
      <div className="rhythm-editor-score-stack">
      <div className="rhythm-editor-draft" inert={!!preview} style={preview ? { visibility: "hidden" } : undefined}>
      {measures.length === 0 ? (
        emptyContent
      ) : (
        <RhythmDraftScore
          overlay={scoreOverlay}
          measureFeedback={measureFeedback}
          measures={measures}
          timeSignature={timeSignature}
          selectedMeasureIndex={selectedMeasureIndex}
          onSelectMeasure={(index) => {
            onSelectMeasure(index);
            setAddEventMessage("");
          }}
        />
      )}
      </div>
      {preview && <div className="rhythm-editor-preview">{preview}</div>}
      </div>
      <div className="rhythm-editor-controls" inert={!!preview} style={preview ? { visibility: "hidden" } : undefined}>
        <p className="rhythm-editor-input-message" role="status">
          {addEventMessage}
        </p>
        <div className="rhythm-editor-input-groups">
        <div className="rhythm-editor-basic-input">
        <div
          role="group"
          aria-label="添加音符"
          className="rhythm-editor-symbol-row"
        >
          <div className="rhythm-editor-symbol-buttons">
            {eventOptions
              .filter((option) => option.kind === "note")
              .map((option) => (
                <button
                  key={`${option.kind}-${option.noteValue}`}
                  type="button"
                  aria-label={option.label}
                  title={option.label}
                  disabled={!hasSelectedMeasure}
                  onClick={() =>
                    addElement({
                      kind: option.kind,
                      noteValue: option.noteValue,
                    })
                  }
                >
                  <RhythmSymbol
                    kind={option.kind}
                    noteValue={option.noteValue}
                  />
                </button>
              ))}

            <button
              type="button"
              className="rhythm-editor-triplet"
              aria-label="小三连"
              title="小三连"
              disabled={!hasSelectedMeasure}
              onClick={() =>
                addElement({
                  kind: "triplet",
                  notes: [
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                    { kind: "note", noteValue: "eighth" },
                  ],
                })
              }
            >
              <RhythmSymbol kind="triplet" />
            </button>
          </div>
        </div>

        <div
          role="group"
          aria-label="添加休止符"
          className="rhythm-editor-symbol-row"
        >
          <div className="rhythm-editor-symbol-buttons">
            {eventOptions
              .filter((option) => option.kind === "rest")
              .map((option) => (
                <button
                  key={`${option.kind}-${option.noteValue}`}
                  type="button"
                  aria-label={option.label}
                  title={option.label}
                  disabled={!hasSelectedMeasure}
                  onClick={() =>
                    addElement({
                      kind: option.kind,
                      noteValue: option.noteValue,
                    })
                  }
                >
                  <RhythmSymbol
                    kind={option.kind}
                    noteValue={option.noteValue}
                  />
                </button>
              ))}
          </div>
        </div>

        </div>
        <div role="group" aria-label="常见节奏型" className="rhythm-editor-pattern-input">
          <div className="rhythm-editor-pattern-buttons">
            {rhythmInputPatterns.map(pattern => (
              <button key={pattern.id} type="button" aria-label={pattern.label} title={pattern.label}
                disabled={!hasSelectedMeasure} onClick={() => addElements(pattern.events)}>
                <RhythmSymbol kind="pattern" events={pattern.events} />
              </button>
            ))}
          </div>
        </div>
        </div>

        <div
          role="group"
          aria-label="编辑当前小节"
          className="rhythm-editor-edit-actions"
        >
          <button
            type="button"
            className="rhythm-editor-dot"
            aria-label="附点"
            disabled={!canToggleLastDot}
            aria-pressed={lastHasDot}
            title="切换当前小节末尾四分或八分音符的附点"
            onClick={toggleLastDot}
          >
            <RhythmSymbol kind="dot" />
          </button>

          <button
            type="button"
            disabled={
              !hasSelectedMeasure || measures[selectedMeasureIndex].length === 0
            }
            onClick={removeLastEvent}
          >
            删除末尾
          </button>
          <button
            type="button"
            disabled={
              !hasSelectedMeasure || measures[selectedMeasureIndex].length === 0
            }
            onClick={clearSelectedMeasure}
          >
            清空当前小节
          </button>
        </div>
      </div>
    </div>
  );
}
