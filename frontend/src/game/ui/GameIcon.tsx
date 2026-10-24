import { ArrowLeft, Play, RotateCcw, SlidersHorizontal, Square, Minus, Plus } from "lucide-react";
import { pixelGlyphs, type PixelGlyphName } from "../rendering/PixelDrawing";

const originals = { back: ArrowLeft, play: Play, retry: RotateCcw, settings: SlidersHorizontal, stop: Square, minus: Minus, plus: Plus };
/** 游戏主题的图标选择集中在此，普通界面继续使用公共图标。 */
export function GameIcon({ name, pixel, size = 18 }: { name: keyof typeof originals; pixel: boolean; size?: number }) {
  if (!pixel) { const Icon = originals[name]; return <Icon size={size} aria-hidden="true" />; }
  return <PixelIcon name={name} size={size} />;
}
export function PixelIcon({ name, size = 21 }: { name: PixelGlyphName; size?: number }) {
  const rows = pixelGlyphs[name];
  return <svg width={size} height={size} viewBox={`0 0 ${rows[0].length} ${rows.length}`} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
    {rows.flatMap((row, y) => [...row].map((on, x) => on === "1" ? <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" /> : null))}
  </svg>;
}
