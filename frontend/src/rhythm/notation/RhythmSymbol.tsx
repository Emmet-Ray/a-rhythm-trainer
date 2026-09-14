import { useEffect, useRef } from "react";
import { Beam, Formatter, Renderer, Tuplet } from "vexflow";
import type { RhythmEvent } from "../RhythmModel";
import { createRhythmStave, rhythmEventToVexFlowStaveNote } from "./RhythmNotation";

type RhythmSymbolProps =
  | { kind: RhythmEvent["kind"]; noteValue: RhythmEvent["noteValue"]; dots?: RhythmEvent["dots"] }
  | { kind: "triplet"; noteValue?: never }
  | { kind: "pattern"; noteValue?: never; events: readonly RhythmEvent[] }
  | { kind: "dot"; noteValue?: never };

/** 工具栏专用的静态记谱图形，不携带编辑行为；名称与交互由外层按钮提供。 */
export function RhythmSymbol(props: RhythmSymbolProps) {
  const { kind, noteValue } = props;
  const dots = props.kind === "note" || props.kind === "rest" ? props.dots : undefined;
  const events = props.kind === "pattern" ? props.events : undefined;
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || kind === "dot") return;
    container.replaceChildren();
    const host = document.createElement("div");
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(120, 120);
    const context = renderer.getContext();
    context.setFillStyle("currentColor");
    context.setStrokeStyle("currentColor");
    const notes = events ? events.map(rhythmEventToVexFlowStaveNote) : kind === "triplet"
      ? Array.from({ length: 3 }, () => rhythmEventToVexFlowStaveNote({ kind: "note", noteValue: "eighth" }))
      : kind === "note" || kind === "rest" ? [rhythmEventToVexFlowStaveNote({ kind, noteValue, dots })] : [];
    if (notes.length === 0) return;
    notes.forEach((note) => note.setStemStyle({ strokeStyle: "currentColor" }));
    const tuplet = kind === "triplet"
      ? new Tuplet(notes, { numNotes: 3, notesOccupied: 2, bracketed: false })
      : null;
    // 只有整组均为短音符时连梁；大附点、大切分中的四分音符不能加入连梁。
    const beam = kind === "triplet" || (kind === "pattern" && events?.every(event =>
      event.kind === "note" && (event.noteValue === "eighth" || event.noteValue === "sixteenth"),
    )) ? new Beam(notes) : null;
    // 借用同一套谱面坐标排版，但不绘制谱线、谱号或小节线。
    const stave = createRhythmStave(0, 0, kind === "pattern" ? 130 : kind === "triplet" ? 100 : 60, false);
    Formatter.FormatAndDraw(context, stave, notes);
    beam?.setContext(context).draw();
    tuplet?.setContext(context).draw();

    const svg = host.querySelector("svg")!;
    container.append(svg);
    // 使用记谱几何边界；浏览器的 text.getBBox 会把音乐字体的整段行高也算进去。
    const bounds = notes[0].getBoundingBox().clone();
    notes.slice(1).forEach((note) => bounds.mergeWith(note.getBoundingBox()));
    if (tuplet) {
      const top = Math.min(bounds.y, tuplet.getYPosition() - 10);
      bounds.h += bounds.y - top;
      bounds.y = top;
    }
    if (kind === "rest" && (noteValue === "whole" || noteValue === "half")) {
      const y = noteValue === "whole" ? bounds.y : bounds.y + bounds.h;
      context.beginPath().moveTo(bounds.x - 5, y).lineTo(bounds.x + bounds.w + 5, y).stroke();
      bounds.x -= 5;
      bounds.w += 10;
    }
    const width = Math.max(kind === "pattern" ? 130 : kind === "triplet" ? 100 : 64, bounds.w + 12);
    const height = Math.max(64, bounds.h + 12);
    svg.setAttribute("viewBox", `${bounds.x + bounds.w / 2 - width / 2} ${bounds.y + bounds.h / 2 - height / 2} ${width} ${height}`);
    svg.setAttribute("focusable", "false");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.removeProperty("width");
    svg.style.removeProperty("height");
    return () => container.replaceChildren();
  }, [kind, noteValue, dots, events]);

  return <span ref={containerRef} className="rhythm-symbol" aria-hidden="true">
    {kind === "dot" ? <svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="4" fill="currentColor" /></svg> : null}
  </span>;
}
