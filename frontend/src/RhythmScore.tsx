import { useEffect, useRef } from "react";
import { Formatter, Renderer, Stave, StaveNote } from "vexflow";

import type { RhythmExercise, RhythmEvent } from "./RhythmModel";

const SCORE_WIDTH = 500;
const SCORE_HEIGHT = 180;
const ACTIVE_NOTE_COLOR = "#646cff";

type RhythmScoreProps = {
  exercise: RhythmExercise;
  activeEventIndex: number | null;
};

// todo: 这里还可以有一个提升点，但是这个点属于“可有可无”的。
// 就是现在的渲染出来的谱子跟平时读的五线谱不太一样，
// 比如现在两个八分音符是分着的，平时的五线谱里两个八分音符应该由连梁连接。
function RhythmScore({
  exercise,
  activeEventIndex,
}: RhythmScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { events, timeSignature } = exercise;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // VexFlow owns everything inside this container. Clearing before setup also
    // makes the effect safe when StrictMode repeats the setup/cleanup cycle.
    container.replaceChildren();

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(SCORE_WIDTH, SCORE_HEIGHT);

    const context = renderer.getContext();
    const stave = new Stave(10, 40, SCORE_WIDTH - 20);
    stave
      .addClef("treble")
      .addTimeSignature(`${timeSignature.beats}/${timeSignature.beatType}`);
    stave.setContext(context).draw();

    const notes = events.map(rhythmEventToVexFlowStaveNote);
    const activeNote =
      activeEventIndex === null ? undefined : notes[activeEventIndex];
    if (activeNote) {
      activeNote.setStyle({
        fillStyle: ACTIVE_NOTE_COLOR,
        strokeStyle: ACTIVE_NOTE_COLOR,
      });
    }

    if (notes.length > 0) {
      Formatter.FormatAndDraw(context, stave, notes);
    }

    return () => {
      container.replaceChildren();
    };
  }, [
    activeEventIndex,
    events,
    timeSignature.beats,
    timeSignature.beatType,
  ]);

  return <div ref={containerRef} />;
}

function rhythmEventToVexFlowStaveNote(event: RhythmEvent): StaveNote {
  // 将时值名称转换为 vexflow 对应的类型
  let duration: string;
  switch (event.noteValue) {
    case "quarter":
      duration = "q";
      break;
    case "eighth":
      duration = "8";
      break;
    default:
      throw new Error("暂不支持该时值。");
  }

  return new StaveNote({
    keys: ["b/4"],
    duration: event.kind === "rest" ? `${duration}r` : duration,
  });
}

export default RhythmScore;
