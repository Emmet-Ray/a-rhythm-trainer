import type { BallAppearance } from "./OrbitBalls";
import type { RoadMaterial } from "./OrbitRoad";
import type { BackdropImage } from "./OrbitBackdrop";
import type { RhythmPoster } from "./RhythmPosters";
export type OrbitThemeId = string;
type ThemeIdentity = { id: string; title: string; description: string };
type MatteTheme = {
  material: "matte";
  colors: { primary: number; warm: number; road: number; edge: number; seam: number; mark: number; past: number; stage: number; error: number; onPrimary: number };
  text: string; muted: string; success: string; buttonBase: string;
  environment: { light: number; contour: number; lightX: number; lightY: number; strength: number };
};
/** 像素关卡只拥有场景美术；界面语义色、道路淡化和命中规则由渲染器拥有。 */
export type OrbitTheme = ThemeIdentity & (MatteTheme | {
  material: "pixel"; stage: number; roadMaterial: RoadMaterial;
  ballAppearance?: BallAppearance; ballDecoration?: "wet-glint";
  pixelEnvironment: BackdropImage & { dimOpacity: number; posters?: readonly RhythmPoster[] };
});
const pixelUi = {
  colors: { primary: 0x97dac2, warm: 0xe7bc78, road: 0x526575, edge: 0x7c879b, seam: 0x283448,
    mark: 0xf4f1e2, past: 0x242c3e, stage: 0x141b2d, error: 0xffaaa0, onPrimary: 0x162d38 },
  text: "#f4f1e2", muted: "#b7c1d3", success: "#97dac2", buttonBase: "#377677",
} as const;
export const PIXEL_PAST_ROAD_ALPHA = .5;
export const orbitStageColor = (theme: OrbitTheme) => theme.material === "pixel" ? theme.stage : theme.colors.stage;
export const themeHex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
/** 公共界面不继承关卡道路色阶；场景色只参与地图绘制。 */
export function orbitThemeStyle(theme: OrbitTheme): Record<string, string> {
  const ui = theme.material === "pixel" ? pixelUi : theme;
  const c = ui.colors;
  return {
    "--ds-ink": ui.text, "--ds-muted": ui.muted,
    "--ds-primary": themeHex(c.primary), "--ds-on-primary": themeHex(c.onPrimary),
    "--ds-primary-base": ui.buttonBase, "--ds-error": themeHex(c.error),
    "--ds-success": ui.success, "--ds-disabled": themeHex(c.past),
    "--ds-line": themeHex(c.edge), "--orbit-stage": themeHex(c.stage),
    "--ds-field-border": themeHex(c.edge), "--ds-surface": themeHex(c.past), "--ds-hover": themeHex(c.seam),
    "--orbit-panel": themeHex(c.stage) + "f5", "--orbit-shadow": themeHex(c.stage),
    "--orbit-accent": themeHex(c.warm),
  };
}

const blendColor = (from: number, to: number, amount: number) => {
  const channel = (shift: number) => Math.round(((from >> shift) & 255) * (1 - amount) + ((to >> shift) & 255) * amount);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

/** 地图层级独立于界面配色；像素主题共用道路与符号规则，背景压暗程度由主题作者决定。 */
export function orbitMapStyle(theme: OrbitTheme) {
  if (theme.material !== "pixel") return { colors: theme.colors, backdropAlpha: 0, guideAlpha: .55 };
  const c = { ...pixelUi.colors, stage: theme.stage };
  const p = theme.roadMaterial.palette;
  return {
    colors: { ...c, road: p.face, edge: p.edge, seam: p.shadow, mark: p.mark, past: blendColor(p.shadow, c.stage, .35) },
    backdropAlpha: theme.pixelEnvironment.dimOpacity,
    guideAlpha: .38,
  };
}

/** 与 Phaser 的 RGB 插值一致，合成整数颜色时截去小数。 */
export function mixThemeColor(a: number, b: number, amount: number) {
  const channel = (shift: number) => ((((b >> shift) & 255) - ((a >> shift) & 255)) * amount + ((a >> shift) & 255)) | 0;
  return channel(16) << 16 | channel(8) << 8 | channel(0);
}
