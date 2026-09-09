import { Dot, Stave, StaveNote, Stem } from "vexflow";
import type { RhythmEvent } from "../RhythmModel";

/** 只显示中线，保留五线坐标供谱号、拍号和休止符定位；隐藏线不代表音高。 */
export function createRhythmStave(x: number, y: number, width: number, showClef: boolean): Stave {
  const stave = new Stave(x, y, width);
  stave.setConfigForLines(Array.from({ length: 5 }, (_, index) => ({ visible: index === 2 })));
  if (showClef) stave.addClef("percussion");
  return stave;
}

/** 单线谱的可见中线位置，而非 VexFlow 内部五线区域的底部。 */
export function getRhythmLineY(stave: Stave): number {
  return stave.getYForLine(2);
}

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
    stemDirection: Stem.UP,
    duration: event.kind === "rest" ? `${duration}r` : duration,
    dots: event.dots ?? 0,
  });
  // dots 决定 VexFlow 内部时值；Dot modifier 才负责画出可见的点。
  if (event.dots === 1) Dot.buildAndAttach([note]);
  return note;
}
