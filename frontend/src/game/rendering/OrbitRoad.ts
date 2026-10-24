import type Phaser from "phaser";
import type { OrbitTrack } from "../core/OrbitTrack";
import type { MapFrame } from "./OrbitMapView";
import { PIXEL_PAST_ROAD_ALPHA, orbitMapStyle, themeHex as hex, mixThemeColor as mix, type OrbitTheme } from "./OrbitTheme";
import { pixelArtSpec, pixelMapTwirl, pixelSpeedGlyph, drawPixelGlyph, drawPixelRing, drawPixelFinishBand } from "./PixelDrawing";


type Point = { x: number; y: number };
type Palette = { shadow: number; face: number; edge: number; mark: number };
export type RoadMaterial = {
  palette: Palette; fringe?: number; joint: number; landing: number; signPlate: boolean;
  finishMark: number;
} & ({ geometry: "plain" | "plank" | "stone" } | { geometry: "asphalt"; reflections: { reflection: number; glint: number } });
export type MaterialStroke = { points: Point[]; color: number; width: number };
export type RoadSurfaceFrame = {
  points: readonly Point[]; first: number; last: number; width: number; grid: number;
  viewport?: { width: number; height: number };
};

/** 几何绑定原路线序号，视口只裁掉不可见装饰；不参与落点、路线或计时计算。 */
export function roadSurfaceStrokes(material: RoadMaterial, frame: RoadSurfaceFrame): MaterialStroke[] {
  const { points, first, last, width, grid, viewport } = frame;
  const strokes: MaterialStroke[] = [];
  if (material.geometry === "plain") return strokes;
  for (let i = Math.max(0, first); i < last; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
    const margin = width + grid * 3;
    if (viewport && (Math.max(a.x, b.x) < -margin || Math.min(a.x, b.x) > viewport.width + margin
      || Math.max(a.y, b.y) < -margin || Math.min(a.y, b.y) > viewport.height + margin)) continue;
    const jointOffset = (index: number, across: number): Point => {
      const p = points[index], prev = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
      const before = Math.hypot(p.x - prev.x, p.y - prev.y), after = Math.hypot(next.x - p.x, next.y - p.y);
      const nx = ((before ? -(p.y - prev.y) / before : -uy) + (after ? -(next.y - p.y) / after : -uy)) / 2;
      const ny = ((before ? (p.x - prev.x) / before : ux) + (after ? (next.x - p.x) / after : ux)) / 2;
      return { x: p.x + nx * across, y: p.y + ny * across };
    };
    const local = (along: number, across: number): Point => along === 0 ? jointOffset(i, across) : along === 1 ? jointOffset(i + 1, across)
      : { x: a.x + dx * along - uy * across, y: a.y + dy * along + ux * across };
    const stroke = (vertices: Point[], color = material.joint, thickness = grid) => strokes.push({ points: vertices, color, width: thickness });
    if (material.geometry === "plank") {
      // 两条纵缝把路面分成三块长板；板头每1.5格错开半格，不添加横向节拍线。
      for (const [lane, stagger] of [[-1, 0], [1, .5]]) {
        let start = 0;
        const breaks = Array.from({ length: 3 }, (_, j) => (Math.floor((i - stagger) / 1.5) + j) * 1.5 + stagger - i);
        for (const gap of breaks) if (gap > start && gap < 1) {
          stroke([local(start, lane * width / 6), local(Math.max(start, gap - .06), lane * width / 6)]);
          start = gap + .06;
        }
        if (start < 1) stroke([local(start, lane * width / 6), local(1, lane * width / 6)]);
      }
    } else {
      // 横缝偏离垂线15–25°。序号扰动只影响接缝，始终留出落点两侧0.35格。
      const angle = (15 + i * 7 % 11) * Math.PI / 180 * (i % 2 ? 1 : -1);
      const tilt = Math.tan(angle) * width * .43 / length;
      const center = Math.min(.65 - Math.abs(tilt), Math.max(.35 + Math.abs(tilt), .48 + (i % 3 - 1) * .025));
      stroke([local(center - tilt, -width * .43), local(center, 0), local(center + tilt, width * .43)]);
      // 错缝的纵向接头只在段中出现；与横缝一样避让落点前后0.35格。
      if (i % 2 === 0) {
        const offset = (i % 4 ? 1 : -1) * width / 6;
        const intersection = center + tilt * offset / (width * .43);
        // 纵缝停在横缝上，沿相邻横缝形成钝角的一侧连接，避免X和箭头。
        const start = tilt >= 0 ? .35 : .65;
        if (Math.abs(intersection - start) * length >= grid * 2) stroke([local(start, offset), local(intersection, offset)]);
      }
      if (i % 3 !== 2 && material.fringe !== undefined) {
        const side = i % 2 ? 1 : -1, u = .22 + i % 3 * .18;
        const fringeLength = grid * (1 + i % 3) / length;
        stroke([local(u, side * (width / 2 + grid * .5)), local(u + fringeLength, side * (width / 2 + grid * .5))], material.fringe);
      }
    }
  }
  return strokes;
}

export function drawRoadSurface(g: Phaser.GameObjects.Graphics, material: RoadMaterial, frame: RoadSurfaceFrame) {
  if (material.geometry === "asphalt") {
    const { points, first, last, width, grid, viewport } = frame;
    for (const r of wetRoadReflections(material.reflections, points, first, last, width, grid, viewport)) {
      g.fillStyle(r.color); g.fillRect(r.x, r.y, r.width, r.height);
    }
    return;
  }
  for (const stroke of roadSurfaceStrokes(material, frame)) {
    g.lineStyle(stroke.width, stroke.color);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}

/** 材质落点只换造型；中心仍为原来的逻辑落点。 */
export function drawMaterialLanding(g: Phaser.GameObjects.Graphics, material: RoadMaterial, point: Point, grid: number, active: boolean, highlight?: number) {
  const alpha = active ? 1 : .28;
  if (material.geometry === "plain") {
    drawPixelGlyph(g, ["1"], point.x, point.y, grid, highlight ?? material.landing, alpha);
  } else if (material.geometry === "stone") {
    drawPixelGlyph(g, ["0110", "1111", "1111", "0110"], point.x, point.y, grid, highlight ?? material.landing, alpha);
  } else {
    const x = Math.round(point.x / grid) * grid, y = Math.round(point.y / grid) * grid;
    g.fillStyle(material.palette.shadow, alpha); g.fillRect(x - grid * 2, y - grid * 2, grid * 4, grid * 4);
    g.fillStyle(highlight ?? material.landing, alpha); g.fillRect(x - grid, y - grid, grid * 2, grid * 2);
  }
}

/** 所有材质共享路面终止带，主题只决定明暗配色。 */
export function drawMaterialFinish(g: Phaser.GameObjects.Graphics, material: RoadMaterial, point: Point, from: Point, roadWidth: number, cell: number, active: boolean) {
  const { finishMark, palette } = material;
  drawPixelFinishBand(g, point, from, roadWidth, cell, finishMark, palette.shadow, active ? 1 : .24);
}
/** 稀疏反射绑定路线序号，不随镜头移动重新随机。 */

export type RoadReflection = { x: number; y: number; width: number; height: number; color: number };

/** 只在足够宽的段落中绘制水平反射；整块反射必须落在路缘内，并远离所有落点。 */
export function wetRoadReflections(colors: { reflection: number; glint: number }, points: readonly Point[], first: number, last: number, width: number, grid: number, viewport?: { width: number; height: number }): RoadReflection[] {
  const result: RoadReflection[] = [];
  for (let i = Math.max(first, 0); i < last; i++) {
    if (i % 3 !== 1) continue;
    const a = points[i], b = points[i + 1];
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    // 反射只出现在段中；屏幕外的材质不参与逐帧几何和避让计算。
    if (viewport && (midX < -grid * 4 || midX > viewport.width + grid * 4 || midY < -grid * 4 || midY > viewport.height + grid * 4)) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    const x = Math.round((a.x + b.x) / 2 / grid) * grid, y = Math.round((a.y + b.y) / 2 / grid) * grid;
    const group = [-1, 0, 1].map((row, index) => ({
      x: x - (index === 1 ? 1 : 2) * grid, y: y + row * 2 * grid,
      width: (index === 1 ? 2 : 4) * grid, height: grid,
      color: index === 1 ? colors.glint : colors.reflection,
    }));
    const fits = group.every(r => [
      { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height }, { x: r.x + r.width, y: r.y + r.height },
    ].every(p => {
      const along = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const across = Math.abs(-(p.x - a.x) * uy + (p.y - a.y) * ux);
      return along >= 0 && along <= length && across <= width / 2 - grid;
    }) && points.every(q => {
      const dx = Math.max(r.x - q.x, 0, q.x - r.x - r.width);
      const dy = Math.max(r.y - q.y, 0, q.y - r.y - r.height);
      return dx * dx + dy * dy >= (length * .4) ** 2;
    }));
    if (fits) result.push(...group);
  }
  return result;
}

/** Owns the continuous surface, materials, landing markers, goals and speed/twirl signs.
 * compositePast commits the translucent past-road pass before active road/markers are painted.
 */
export class OrbitRoad {
  private readonly drawing: Phaser.GameObjects.Graphics;
  private readonly track: OrbitTrack;
  private readonly twirls: Set<number>;
  private readonly speedTiles: Set<number>;
  private readonly speedLabels: Phaser.GameObjects.Text[];
  private colors!: ReturnType<typeof orbitMapStyle>["colors"];
  private pixel = false;
  private roadMaterial?: RoadMaterial;
  private pixelCell = 3;
  private twirl: { rows: readonly string[]; cell: number } = { rows: pixelMapTwirl, cell: 3 };
  constructor(scene: Phaser.Scene, drawing: Phaser.GameObjects.Graphics, track: OrbitTrack) {
    this.drawing = drawing;
    this.track = track;
    this.twirls = new Set(track.map.twirlTiles);
    this.speedTiles = new Set(track.map.speedTiles.map(change => change.tile));
    this.speedLabels = track.map.speedTiles.map(change => scene.add.text(0, 0,
      change.halfTurnBeats === .5 ? "2×" : change.halfTurnBeats === 8 ? "⅛" : change.halfTurnBeats === 4 ? "¼" : change.halfTurnBeats === 2 ? "½" : "1×", { fontFamily: "sans-serif", fontStyle: "bold" }).setOrigin(.5));
  }
  refreshTheme(theme: OrbitTheme) {
    this.colors = orbitMapStyle(theme).colors;
    this.pixel = theme.material === "pixel";
    this.roadMaterial = theme.material === "pixel" ? theme.roadMaterial : undefined;
  }
  private road(points: Point[], first: number, last: number, width: number, color: number) {
    const g = this.drawing, radius = width / 2;
    g.fillStyle(color);
    for (let i = first; i < last; i++) {
      const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy), nx = -dy / length * radius, ny = dx / length * radius;
      g.fillTriangle(a.x + nx, a.y + ny, a.x - nx, a.y - ny, b.x + nx, b.y + ny);
      g.fillTriangle(b.x + nx, b.y + ny, a.x - nx, a.y - ny, b.x - nx, b.y - ny);
      // 圆接头限制45°折线外扩；同色实心绘制不会在重叠处累积透明度。
      g.fillCircle(a.x, a.y, radius);
    }
    g.fillCircle(points[last].x, points[last].y, radius);
  }

  private spiral(point: Point, radius: number, color: number, strokeWidth: number, alpha = 1) {
    const g = this.drawing;
    if (this.pixel) {
      drawPixelGlyph(g, this.twirl.rows, point.x, point.y, this.twirl.cell, color, alpha);
      return;
    }
    g.lineStyle(strokeWidth, color, alpha); g.beginPath();
    for (let sample = 0; sample <= 40; sample++) {
      const f = sample / 40, angle = -.4 + f * Math.PI * 3.5;
      const x = point.x + Math.cos(angle) * radius * f, y = point.y + Math.sin(angle) * radius * f;
      if (sample === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }

  private ring(x: number, y: number, radius: number, color: number, alpha = 1, width = 2) {
    if (this.pixel) drawPixelRing(this.drawing, x, y, radius, this.pixelCell, color, alpha);
    else { this.drawing.lineStyle(width, color, alpha); this.drawing.strokeCircle(x, y, radius); }
  }

  private finishPad(p: Point, from: Point, spacing: number, full: boolean, active: boolean, landed: boolean) {
    const g = this.drawing, c = this.colors, radius = spacing * .36;
    const color = active ? c.primary : c.mark, alpha = active ? 1 : .24;
    if (full && this.pixel && this.roadMaterial) {
      drawMaterialFinish(g, this.roadMaterial, p, from, spacing * pixelArtSpec.roadWidthRatio, this.pixelCell, active);
      return;
    }
    if (full && this.pixel) {
      drawPixelFinishBand(g, p, from, spacing * pixelArtSpec.roadWidthRatio, this.pixelCell, c.mark, c.stage, alpha);
      return;
    }
    if (full) {
      // 扩宽的哑光终点台与方格终止带；落地后仍能从外圈辨认终点。
      g.fillStyle(active ? mix(c.road, c.primary, landed ? .2 : .06) : c.past);
      g.fillCircle(p.x, p.y, radius);
      this.ring(p.x, p.y, radius, color, alpha);
      if (!this.pixel) this.ring(p.x, p.y, radius * .73, color, alpha * .6, 1);
      const dx = p.x - from.x, dy = p.y - from.y, length = Math.hypot(dx, dy);
      const ux = dx / length, uy = dy / length, cell = spacing * .07;
      const corner = (u: number, v: number) => ({ x: p.x + ux * u - uy * v, y: p.y + uy * u + ux * v });
      g.fillStyle(color, alpha);
      for (let row = 0; row < 2; row++) for (let column = 0; column < 4; column++) {
        if ((row + column) % 2 !== 0) continue;
        const u = (row - 1) * cell, v = (column - 2) * cell;
        const a = corner(u, v), b = corner(u + cell, v), c = corner(u, v + cell), d = corner(u + cell, v + cell);
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y); g.fillTriangle(b.x, b.y, c.x, c.y, d.x, d.y);
      }
    } else {
      // 片段终点是道路上的临时检查点，四段开口圆环保留后续道路的连续性。
      if (this.pixel) {
        drawPixelRing(g, p.x, p.y, radius, this.pixelCell, this.roadMaterial ? c.edge : color, alpha, 0, true);
        return;
      }
      g.lineStyle(landed ? 2.5 : 1.5, color, alpha);
      for (let i = 0; i < 4; i++) {
        const angle = Math.PI * i / 2;
        g.beginPath(); g.arc(p.x, p.y, radius, angle + .13, angle + Math.PI / 2 - .13); g.strokePath();
      }
    }
  }

  draw(frame: MapFrame, highlightColor: number | undefined, compositePast: (alpha: number) => void) {
    const { width, height, grid, spacing, points, pose, current, last, landed } = frame;
    const c = this.colors, g = this.drawing;
    const roadWidth = spacing * (this.pixel ? pixelArtSpec.roadWidthRatio : .48);
    const snap = (size: number) => Math.max(1, Math.round(size / grid)) * grid;
    this.pixelCell = frame.symbols.cell;
    this.twirl = frame.symbols.twirl;
    if (this.pixel) {
      // 侧壁、亮边和面层按整格增减宽度，光栅化后每侧恰好一格。
      const lower = points.map(p => ({ x: p.x, y: p.y + snap(roadWidth * .17) }));
      const bevel = points.map(p => ({ x: p.x, y: p.y - grid }));
      // 所有状态共用完整路面；透明度只作用于合成层，不改变材质和轮廓。
      const drawSegment = (first: number, end: number) => {
        if (end <= first) return;
        this.road(lower, first, end, roadWidth + grid * 2, c.stage);
        this.road(lower, first, end, roadWidth, c.seam);
        this.road(points, first, end, roadWidth + grid * 2, c.edge);
        this.road(bevel, first, end, roadWidth, c.edge);
        this.road(points, first, end, roadWidth - grid * 2, c.road);
        if (this.roadMaterial) drawRoadSurface(g, this.roadMaterial, {
          points, first, last: end, width: roadWidth - grid * 2, grid, viewport: { width, height },
        });
        // 木板与石板由材质自己铺缝，其余材质保留原有横缝。
        if (this.roadMaterial && ["plank", "stone"].includes(this.roadMaterial.geometry)) return;
        for (let i = first + 1; i <= end; i++) {
          const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
          const nx = -dy / length * roadWidth * .47, ny = dx / length * roadWidth * .47;
          const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
          g.lineStyle(grid, c.seam, .7);
          g.lineBetween(midX - nx, midY - ny, midX + nx, midY + ny);
        }
      };
      drawSegment(0, current);
      drawSegment(last, points.length - 1);
      compositePast(PIXEL_PAST_ROAD_ALPHA);
      g.clear();
      drawSegment(current, last);
    } else {
      this.road(points, 0, points.length - 1, roadWidth, c.past);
      this.road(points, current, last, roadWidth + .8, c.edge);
      this.road(points, current, last, roadWidth - 1, c.road);
    }
    if (!this.pixel) for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const nx = -dy / length * roadWidth * .47, ny = dx / length * roadWidth * .47;
      const active = i > current && i <= last;
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      g.lineStyle(1, active ? c.seam : c.stage, active ? .7 : .35);
      g.lineBetween(midX - nx, midY - ny, midX + nx, midY + ny);
    }
    points.forEach((p, index) => {
      // 范围外保留路面作为上下文，已失效的功能印记不再占据画面。
      if (this.pixel && (index < current || index > last)) return;
      const active = index >= current && index <= last;
      const color = active ? c.mark : c.road;
      if (this.twirls.has(index)) {
        if (this.roadMaterial && this.roadMaterial.signPlate) {
          const size = (this.twirl.rows.length + 2) * this.twirl.cell;
          g.fillStyle(c.seam, active ? 1 : .28);
          g.fillRect(Math.round((p.x - size / 2) / grid) * grid, Math.round((p.y - size / 2) / grid) * grid, size, size);
        }
        this.spiral(p, roadWidth * .24, color, Math.max(.9, roadWidth * .03), active ? 1 : .28);
      }
      else if (this.pixel) {
        if (this.roadMaterial) {
          // 变速地块保留功能标记，所有材质仅对普通落点使用命中高光。
          const ordinaryLanding = !this.speedTiles.has(index);
          const wasHit = ordinaryLanding && frame.hit.index > 0 && index === frame.hit.index + this.track.anchorOffset;
          const highlight = wasHit ? highlightColor : undefined;
          // 命中道钉120ms后退到已走状态；该颜色切换不属于装饰动画。
          const lit = wasHit || (index === current && pose.anchor > 0) ? highlight !== undefined : active;
          drawMaterialLanding(g, this.roadMaterial, p, grid, lit, highlight);
        }
      } else { g.fillStyle(color, active ? 1 : .28); g.fillCircle(p.x, p.y, Math.max(.9, spacing * .017)); }
    });
    const fullEnd = points.length - 1;
    this.finishPad(points[fullEnd], points[fullEnd - 1], spacing, true, last === fullEnd, landed && last === fullEnd);
    if (last !== fullEnd) this.finishPad(points[last], points[last - 1], spacing, false, true, landed);
    this.speedLabels.forEach((label, index) => {
      const tile = this.track.map.speedTiles[index].tile, p = points[tile];
      const active = tile >= current && tile <= last;
      label.setVisible(!this.pixel && active);
      if (!active) return;
      if (this.pixel) {
        const rows = pixelSpeedGlyph(this.track.map.speedTiles[index].halfTurnBeats);
        const cell = snap(width / pixelArtSpec.symbolReferenceWidth * pixelArtSpec.speedCellScale);
        const w = (rows[0].length + 4) * cell, h = 9 * cell;
        const left = Math.round((p.x - w / 2) / grid) * grid;
        const top = Math.round((p.y - spacing * .55 - h / 2) / grid) * grid;
        // 窄边铭牌与短杆同属一个标记，走过时一起移除。
        g.fillStyle(c.edge); g.fillRect(Math.round(p.x / grid) * grid, top + h, grid, Math.max(grid, p.y - roadWidth / 2 - top - h));
        g.fillStyle(c.edge); g.fillRect(left + grid, top, w - grid * 2, h);
        g.fillRect(left, top + grid, w, h - grid * 2);
        g.fillStyle(c.stage); g.fillRect(left + grid, top + grid, w - grid * 2, h - grid * 2);
        drawPixelGlyph(g, rows, left + w / 2, top + h / 2, cell, c.mark);
      }
      label.setPosition(p.x, p.y - spacing * .46).setFontSize(Math.max(10, spacing * .18)).setColor(hex(c.mark))
        .setAlpha(tile >= current && tile <= last ? 1 : .28);
    });
  }
}
