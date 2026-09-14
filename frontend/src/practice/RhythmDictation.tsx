import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  RhythmEditor,
  canEditRhythmElements,
  type RhythmEditorHandle,
} from "./RhythmEditor";
import { RhythmDraftScore } from "../rhythm/notation/RhythmDraftScore";

import type { RhythmElement, RhythmExercise } from "../rhythm/RhythmModel";
import RhythmPlayback from "./RhythmPlayback";
import PracticeFrame from "./PracticeFrame";
import PracticeCue from "./PracticeCue";

{
  /*
    # 交互过程：
    # 初始乐谱空白
    # 1. 用户点击播放按钮，播放音频（可能重复多次）
    # 2. 用户听出来了一些节奏，开始填写
    # 3. 用户点击验证答案（最少听出来一小节可以验证答案）
    # 4. 反馈：正确/有错误
    # 重复1-4，直到所有小节的节奏都被回答正确

    # 核心内容是乐谱交互（写、删、验证），我想的最理想的状态是用户直接在乐谱上写/删
    */
}
/**
 * 判断小节的记谱是否一致，不修改输入；三连音保留组边界并比较组内音符。
 * 空白答案不通过；其余按数量、顺序、kind、noteValue 和 dots 比较。
 * dots 省略等同于 0，不接受仅总时值相同的不同写法。
 * expected 应为已校验的标准小节；本函数不负责拍数校验或三连音组展开。
 */
// eslint-disable-next-line react-refresh/only-export-components -- 与听写组件同文件维护，导出纯函数供测试；修改此导出时可能触发完整刷新。
export function isMeasureAnswerCorrect(
  answer: readonly RhythmElement[],
  expected: readonly RhythmElement[],
): boolean {
  if (answer.length === 0 || answer.length !== expected.length) return false;

  return answer.every((event, index) => {
    const target = expected[index];
    if (event.kind === "triplet" || target.kind === "triplet") {
      return (
        event.kind === "triplet" &&
        target.kind === "triplet" &&
        event.notes.length === 3 &&
        target.notes.length === 3 &&
        isMeasureAnswerCorrect(event.notes, target.notes)
      );
    }
    return (
      event.kind === target.kind &&
      event.noteValue === target.noteValue &&
      (event.dots ?? 0) === (target.dots ?? 0)
    );
  });
}

type RhythmDictationProps = {
  exercise: RhythmExercise | null;
  bpm: number;
  metronomeEnabled?: boolean;
  extraActions?: (busy: boolean) => ReactNode;
  settingsPanel?: ReactNode;
};

type MeasureVerdict = "unchecked" | "correct" | "incorrect";

// 核心的节奏听写组件
// 一次挂载对应一道题；调用方换题时通过 key 重建，清空答案和交互状态。
export function RhythmDictation({
  exercise,
  bpm,
  metronomeEnabled = true,
  extraActions,
  settingsPanel,
}: RhythmDictationProps) {
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const editorRef = useRef<RhythmEditorHandle>(null);
  const [playbackScope, setPlaybackScope] = useState<"all" | "measure">("all");
  const [isReferenceAnswerVisible, setIsReferenceAnswerVisible] =
    useState(false);
  const referenceAnswerId = useId();
  const referenceMeasures = useMemo(
    () => exercise?.measures.map(({ elements }) => elements) ?? [],
    [exercise],
  );
  // 只取标准答案的小节数量，绝不把标准答案的音符复制到草稿。
  const [answerMeasures, setAnswerMeasures] = useState<RhythmElement[][]>(
    () => exercise?.measures.map(() => []) ?? [],
  );
  const hasSelectedMeasure = answerMeasures[selectedMeasureIndex] !== undefined;
  const [measureVerdicts, setMeasureVerdicts] = useState<MeasureVerdict[]>(
    () => exercise?.measures.map(() => "unchecked") ?? [],
  );
  // 不把编辑器尚不能作答的题判成用户错误。
  const expectedMeasures = useMemo(
    () =>
      exercise?.measures.map(({ elements }) => {
        if (canEditRhythmElements(elements)) return elements;
        return null;
      }) ?? [],
    [exercise],
  );
  const expectedMeasure = expectedMeasures[selectedMeasureIndex];
  const isComplete =
    measureVerdicts.length > 0 &&
    measureVerdicts.every((verdict) => verdict === "correct");

  function verifySelectedMeasure() {
    if (!hasSelectedMeasure || !expectedMeasure) return;
    editorRef.current?.clearMessage();
    const correct = isMeasureAnswerCorrect(
      answerMeasures[selectedMeasureIndex],
      expectedMeasure,
    );
    const nextVerdicts = measureVerdicts.map((verdict, index) =>
      index === selectedMeasureIndex
        ? correct
          ? "correct"
          : "incorrect"
        : verdict,
    );
    setMeasureVerdicts(nextVerdicts);
    if (nextVerdicts.every((verdict) => verdict === "correct"))
      setResultVisible(true);
  }

  return (
    <div className="rhythm-dictation design-system">
      <PracticeFrame
        settingsPanel={settingsPanel}
        toolbar={
          <div className="dictation-playbar">
            {/* 只重建播放器：切换范围/小节取消旧排程，草稿和验证结果仍保留。 */}
            <RhythmPlayback
              key={[bpm, playbackScope, selectedMeasureIndex].join("-")}
              bpm={bpm}
              metronomeEnabled={metronomeEnabled}
              onCountInChange={setCountdown}
              onStart={() => setResultVisible(false)}
              extraActions={extraActions}
              timeSignature={exercise?.timeSignature ?? null}
              options={[
                {
                  id: "question",
                  label: "播放题目",
                  stopLabel: "停止题目",
                  measures: !exercise
                    ? null
                    : playbackScope === "all"
                      ? referenceMeasures
                      : referenceMeasures.slice(
                          selectedMeasureIndex,
                          selectedMeasureIndex + 1,
                        ),
                },
                {
                  id: "answer",
                  label: "播放我的答案",
                  stopLabel: "停止答案",
                  measures:
                    playbackScope === "all"
                      ? answerMeasures
                      : answerMeasures.slice(
                          selectedMeasureIndex,
                          selectedMeasureIndex + 1,
                        ),
                },
              ]}
              controls={
                <div
                  className="dictation-scope"
                  role="group"
                  aria-label="播放范围"
                >
                  <label className="dictation-scope-toggle">
                    <input
                      type="checkbox"
                      checked={playbackScope === "measure"}
                      disabled={!exercise}
                      onChange={(event) =>
                        setPlaybackScope(
                          event.target.checked ? "measure" : "all",
                        )
                      }
                    />
                    <span>仅播放当前小节</span>
                  </label>
                </div>
              }
            />
          </div>
        }
      >
        <RhythmEditor
          preview={isReferenceAnswerVisible && exercise ? (
            <section id={referenceAnswerId} className="dictation-reference" aria-label="参考答案">
              <RhythmDraftScore
                navigationLabel="参考答案"
                measures={referenceMeasures}
                timeSignature={exercise.timeSignature}
                overlay={countdown !== null ? <PracticeCue countdown={countdown} /> : null}
              />
            </section>
          ) : null}
          scoreOverlay={
            countdown !== null ? (
              <PracticeCue countdown={countdown} />
            ) : isComplete && resultVisible ? (
              <PracticeCue passed onDismiss={() => setResultVisible(false)} />
            ) : null
          }
          measureFeedback={measureVerdicts.map((verdict, index) =>
            verdict === "unchecked" ? null : (
              <span
                key={index}
                role="status"
                aria-label={`小节 ${index + 1} 验证结果`}
                data-verdict={verdict}
              >
                {verdict === "correct" ? "✓ 正确" : "× 有错误"}
              </span>
            ),
          )}
          ref={editorRef}
          emptyContent={
            <div className="empty-practice-score" role="status">
              请先生成题目
            </div>
          }
          measures={answerMeasures}
          timeSignature={exercise?.timeSignature ?? { beats: 4, beatType: 4 }}
          selectedMeasureIndex={selectedMeasureIndex}
          onSelectMeasure={setSelectedMeasureIndex}
          onChange={(measureIndex, elements) => {
            setResultVisible(false);
            setAnswerMeasures((previous) =>
              previous.map((measure, index) =>
                index === measureIndex ? elements : measure,
              ),
            );
            setMeasureVerdicts((previous) =>
              previous.map((verdict, index) =>
                index === measureIndex ? "unchecked" : verdict,
              ),
            );
          }}
        />
        <div className="dictation-verification">
          <div className="dictation-verification-result" inert={isReferenceAnswerVisible}
            style={isReferenceAnswerVisible ? { visibility: "hidden" } : undefined}>
            <button
              className="dictation-verify"
              type="button"
              disabled={!hasSelectedMeasure || !expectedMeasure}
              onClick={verifySelectedMeasure}
            >
              验证当前小节
            </button>
          </div>
          <button
            type="button"
            aria-pressed={isReferenceAnswerVisible}
            disabled={!exercise}
            aria-controls={referenceAnswerId}
            onClick={() => {
              setResultVisible(false);
              setIsReferenceAnswerVisible((previous) => !previous);
            }}
          >
            {isReferenceAnswerVisible ? "返回作答" : "查看答案"}
          </button>
        </div>
        {expectedMeasures.some((measure) => measure === null) && (
          <p role="alert">
            本题包含当前编辑器暂不支持的节奏，暂时无法完成作答。
          </p>
        )}
      </PracticeFrame>
    </div>
  );
}
