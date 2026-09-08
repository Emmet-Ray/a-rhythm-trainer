import { Dot, StaveNote } from "vexflow";
import type { RhythmEvent } from "./RhythmModel";

// 统一节奏事件的记谱规则；不负责小节校验、排版或连梁。
export function rhythmEventToVexFlowStaveNote(event: RhythmEvent): StaveNote {
  let duration: string;
  switch (event.noteValue) {
    case "whole":
      duration = "w";
      break;
    case "half":
      duration = "h";
      break;
    case "quarter":
      duration = "q";
      break;
    case "eighth":
      duration = "8";
      break;
    case "sixteenth":
      duration = "16";
      break;
    default:
      throw new Error("暂不支持该时值。");
  }

  const note = new StaveNote({
    keys: ["b/4"],
    duration: event.kind === "rest" ? `${duration}r` : duration,
    dots: event.dots ?? 0,
  });
  // dots 决定 VexFlow 内部时值；Dot modifier 才负责画出可见的点。
  if (event.dots === 1) Dot.buildAndAttach([note]);
  return note;
}
