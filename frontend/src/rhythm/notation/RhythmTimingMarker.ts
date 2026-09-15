import type { RenderContext } from "vexflow";
import type { TimingEvent } from "../RhythmTiming";

/** 在给定中心绘制判定标记：实心圆命中、叉号误敲、空心圆漏拍，不只靠颜色区分。 */
export function drawTimingMarker(context: RenderContext, x: number, y: number, kind: TimingEvent["kind"]): void {
  const color = kind === "hit" ? "var(--ds-success, #287343)" : "var(--ds-error, #ad3838)";
  context.save().setFillStyle(color).setStrokeStyle(color).setLineWidth(2).beginPath();
  if (kind === "wrongTap") {
    context.moveTo(x - 4, y - 4).lineTo(x + 4, y + 4);
    context.moveTo(x + 4, y - 4).lineTo(x - 4, y + 4);
    context.stroke();
  } else {
    // 空心圆计入描边宽度，与实心圆保持相同的外径。
    context.arc(x, y, kind === "miss" ? 5 : 6, 0, Math.PI * 2, false);
    if (kind === "miss") context.stroke();
    else context.fill();
  }
  context.restore();
}
