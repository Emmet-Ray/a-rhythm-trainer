import type Phaser from "phaser";

/** 位图笔画对齐统一屏幕网格，避免粗化滤镜吞掉旋涡/分数字符。 */
export function drawPixelGlyph(g: Phaser.GameObjects.Graphics, rows: readonly string[], x: number, y: number, cell: number, color: number, alpha = 1) {
  const left = Math.round((x - rows[0].length * cell / 2) / cell) * cell;
  const top = Math.round((y - rows.length * cell / 2) / cell) * cell;
  g.fillStyle(color, alpha);
  rows.forEach((row, j) => [...row].forEach((on, i) => {
    if (on === "1") g.fillRect(left + i * cell, top + j * cell, cell, cell);
  }));
}

/** 圆周由方形光点组成；零号光点与目标对齐，保留读图所需的实际半径。 */
export function drawPixelRing(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, cell: number, color: number, alpha = 1, angle = 0, sparse = false) {
  const count = Math.max(16, Math.round(Math.PI * 2 * radius / (cell * (sparse ? 4 : 1.4))));
  g.fillStyle(color, alpha);
  for (let i = 0; i < count; i++) {
    const a = angle + i / count * Math.PI * 2;
    g.fillRect(Math.round((x + Math.cos(a) * radius) / cell) * cell, Math.round((y + Math.sin(a) * radius) / cell) * cell, cell, cell);
  }
}

/** 两排方格嵌在落点前方，沿末段道路横向排列；按地图像素格采样，斜路也不引入平滑边缘。 */
export function drawPixelFinishBand(g: Phaser.GameObjects.Graphics, point: { x: number; y: number }, from: { x: number; y: number }, roadWidth: number, grid: number, light: number, dark: number, alpha = 1) {
  const dx = point.x - from.x, dy = point.y - from.y, length = Math.hypot(dx, dy);
  if (!length) return;
  const ux = dx / length, uy = dy / length;
  const square = roadWidth * .22;
  // 距最终球心至少 0.46 个路宽；球径约 0.83 个路宽，停稳后不会盖住终止带。
  const start = -roadWidth * .46 - square * 2;
  const cx = point.x + ux * (start + square), cy = point.y + uy * (start + square);
  const extent = square * 3;
  for (let y = Math.floor((cy - extent) / grid) * grid; y <= cy + extent; y += grid) {
    for (let x = Math.floor((cx - extent) / grid) * grid; x <= cx + extent; x += grid) {
      const px = x + grid / 2 - point.x, py = y + grid / 2 - point.y;
      const row = Math.floor((px * ux + py * uy - start) / square);
      const column = Math.floor((-px * uy + py * ux + square * 2) / square);
      if (row < 0 || row >= 2 || column < 0 || column >= 4) continue;
      g.fillStyle((row + column) % 2 === 0 ? light : dark, alpha);
      g.fillRect(x, y, grid, grid);
    }
  }
}

export const pixelArtSpec = {
  background: { width: 480, height: 270 },
  ballPixels: 14,
  ballRadiusRatio: .24, roadWidthRatio: .58,
  symbolReferenceWidth: 640, speedCellScale: 1.25,
  twirlDisplayCells: 7,
} as const;


/** 游戏像素图形的原始网格；DOM 图标与地图共用造型，禁止从细线图标降采样。 */
export const pixelGlyphs = {
  play: ["0100000", "0110000", "0111000", "0111100", "0111000", "0110000", "0100000"],
  stop: ["0000000", "0111110", "0111110", "0111110", "0111110", "0111110", "0000000"],
  back: ["0001000", "0011000", "0110000", "1111111", "0110000", "0011000", "0001000"],
  retry: ["0011100", "0100010", "1100001", "1110001", "0000001", "0100010", "0011100"],
  settings: ["0010000", "1111111", "0010000", "0000000", "0000100", "1111111", "0000100"],
  close: ["1100011", "0110110", "0011100", "0001000", "0011100", "0110110", "1100011"],
  plus: ["0001000", "0001000", "0001000", "1111111", "0001000", "0001000", "0001000"],
  minus: ["0000000", "0000000", "0000000", "1111111", "0000000", "0000000", "0000000"],
  twirl: ["1111111", "1000001", "1011101", "1010101", "1010001", "1011111", "1000000"],
  crown: ["100010001", "110111011", "111111111", "011111110", "011111110", "000000000", "011111110"],
} as const;
export type PixelGlyphName = keyof typeof pixelGlyphs;
const digits: Record<string, readonly string[]> = {
  "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "×": ["000", "101", "010", "101", "000"],
  "/": ["001", "001", "010", "100", "100"],
};
export function pixelSpeedGlyph(halfTurnBeats: .5 | 1 | 2 | 4 | 8): readonly string[] {
  const label = halfTurnBeats < 1 ? "2×" : halfTurnBeats === 1 ? "1×" : `1/${halfTurnBeats}`;
  return Array.from({ length: 5 }, (_, row) => [...label].map(char => digits[char][row]).join("0"));
}

/** Finer map spiral; HUD icons retain their compact seven-cell grid. */
export const pixelMapTwirl = ["11111111111", "10000000001", "10111111101", "10100000101", "10101110101", "10101010101", "10101000101", "10101111101", "10100000001", "10111111111", "10000000000"] as const;

/** 地图符号与反馈共享一套网格尺度；选择最接近验收显示宽度的旋涡。 */
export function pixelMapMetrics(width: number, grid: number) {
  const snap = (size: number) => Math.max(1, Math.round(size / grid)) * grid;
  const twirlWidth = width / pixelArtSpec.symbolReferenceWidth * pixelArtSpec.speedCellScale * pixelArtSpec.twirlDisplayCells;
  return {
    cell: snap(twirlWidth / pixelMapTwirl.length),
    twirl: [pixelMapTwirl, pixelGlyphs.twirl].map(rows => ({ rows, cell: snap(twirlWidth / rows.length) }))
      .reduce((best, next) => Math.abs(next.rows.length * next.cell - twirlWidth) < Math.abs(best.rows.length * best.cell - twirlWidth) ? next : best),
  };
}
