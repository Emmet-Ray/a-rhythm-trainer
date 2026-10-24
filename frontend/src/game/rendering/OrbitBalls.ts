import type Phaser from "phaser";
import type { OrbitTrack } from "../core/OrbitTrack";
import type { MapFrame } from "./OrbitMapView";
import { orbitMapStyle, themeHex as hex, mixThemeColor as mix, type OrbitTheme } from "./OrbitTheme";
import { pixelArtSpec, pixelGlyphs, drawPixelGlyph, drawPixelRing } from "./PixelDrawing";
import { ORBIT_LANDING_MS, ORBIT_FAILURE_REVEAL_MS } from "../runtime/OrbitEnding";

type Point = { x: number; y: number };

export type BallAppearance = { outline?: number };
type BallPalette = Record<"S" | "B" | "L" | "H" | "C", number>;
export type PixelBallTemplate = {
  rows: readonly string[];
  outline: number;
  primary: BallPalette;
  warm: BallPalette;
};

/** 写入原生像素，不插值；透明留白占2/3，使纹理中心和既有显示球径保持一致。 */
export function paintPixelBall(ctx: CanvasRenderingContext2D, template: PixelBallTemplate, warm: boolean, outline = template.outline) {
  const size = template.rows.length;
  const palette: Record<string, number> = { ...(warm ? template.warm : template.primary), O: outline };
  ctx.clearRect(0, 0, size * 3, size * 3);
  template.rows.forEach((row, y) => [...row].forEach((role, x) => {
    if (role === ".") return;
    ctx.fillStyle = `#${palette[role].toString(16).padStart(6, "0")}`;
    ctx.fillRect(size + x, size + y, 1, 1);
  }));
}

/** 缓存随场景销毁；模板身份、球身份和轮廓色决定纹理，不依赖关卡或帧时间。 */
export function createPixelBallTextures(scene: Phaser.Scene, template: PixelBallTemplate) {
  const textures = new Map<string, Phaser.Textures.CanvasTexture>();
  return (warm: boolean, appearance?: BallAppearance) => {
    const outline = appearance?.outline ?? template.outline;
    const key = `orbit-gem-${warm ? "warm" : "primary"}-${outline}`;
    let texture = textures.get(key);
    if (!texture) {
      const size = template.rows.length * 3;
      texture = scene.textures.createCanvas(key, size, size)!;
      paintPixelBall(texture.context, template, warm, outline);
      texture.setSmoothPixelArt(true);
      texture.refresh();
      textures.set(key, texture);
    }
    return texture;
  };
}



export const gemBallSpec = {
  pixels: 14,
  ringScale: [1, 1.3, 1.6, 1.9], ringAlpha: [.9, .7, .45, .2],
  trailAlpha: [.6, .45, .3, .15],
} as const;
/** 优先使用地图同格；只在相对原球径偏差不超过10%时采用，否则保留原直径。 */
export function gemBallSize(grid: number, originalDiameter: number) {
  const nativeDiameter = gemBallSpec.pixels * grid;
  const aligned = Math.abs(nativeDiameter / originalDiameter - 1) <= .1;
  return { diameter: aligned ? nativeDiameter : originalDiameter, aligned };
}
/** 使用未包裹的轨道角度；晚按越过目标时返回0，不能绕整圈重新点亮。 */
export function gemGuideSweep(angle: number, targetAngle: number, direction: 1 | -1) {
  return Math.max(0, Math.min(Math.PI * 2, (targetAngle - angle) * direction));
}
/** 四点、两格间隔优先；160ms仅为可见历史上限，段首及慢速时允许少画。 */
export function gemTrailOffsets(grid: number, spacing: number, radiansPerMs: number, elapsedMs: number) {
  const available = radiansPerMs * Math.min(Math.max(0, elapsedMs), 160);
  return [1, 2, 3, 4].map(k => 2 * k * grid / spacing).filter(angle => angle <= available + 1e-10);
}
export function gemHitFrame(age: number) {
  return age >= 0 && age < 240 ? Math.floor(age / 60) : null;
}

export type GemBallFrame = {
  anchor: Point; spacing: number; grid: number; diameter: number;
  angle: number; targetAngle: number | null; direction: 1 | -1; movingWarm: boolean;
  elapsedMs: number; radiansPerMs: number; motion: boolean; moving: boolean;
  hit: { point: Point; age: number; warm: boolean } | null;
};

/** 宝石双球共用的圆周、拖尾和命中表现。只读取本帧状态，不拥有计时器或判定。 */
export class GemBallEffects {
  private readonly palette: Pick<PixelBallTemplate, "primary" | "warm">;
  constructor(palette: Pick<PixelBallTemplate, "primary" | "warm">) { this.palette = palette; }
  private tones(warm: boolean) {
    const { S, B, L, H } = warm ? this.palette.warm : this.palette.primary;
    return [S, B, L, H];
  }
  landingHighlight(age: number, warm: boolean) {
    return age >= 0 && age < 120 ? (warm ? this.palette.warm : this.palette.primary).H : undefined;
  }

  draw(g: Phaser.GameObjects.Graphics, frame: GemBallFrame, accent?: "wet-glint") {
    const { anchor, spacing, grid, diameter, angle, targetAngle, direction, movingWarm, hit } = frame;
    const movingTones = this.tones(movingWarm);
    if (targetAngle !== null) {
      const sweep = gemGuideSweep(angle, targetAngle, direction);
      const count = Math.max(16, Math.round(Math.PI * 2 * spacing / (grid * 3)));
      for (let i = 0; i < count; i++) {
        const a = targetAngle + i / count * Math.PI * 2;
        const ahead = (((a - angle) * direction % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        g.fillStyle(movingTones[1], sweep > 0 && ahead <= sweep + 1e-8 ? .55 : .18);
        g.fillRect(Math.round((anchor.x + Math.cos(a) * spacing) / grid) * grid,
          Math.round((anchor.y + Math.sin(a) * spacing) / grid) * grid, grid, grid);
      }
    }
    if (frame.motion && frame.moving) {
      gemTrailOffsets(grid, spacing, frame.radiansPerMs, frame.elapsedMs).forEach((offset, i) => {
        const a = angle - direction * offset;
        g.fillStyle(movingTones[3 - i], gemBallSpec.trailAlpha[i]);
        g.fillRect(Math.round((anchor.x + Math.cos(a) * spacing) / grid) * grid,
          Math.round((anchor.y + Math.sin(a) * spacing) / grid) * grid, grid, grid);
      });
    }
    const index = hit ? gemHitFrame(hit.age) : null;
    if (!frame.motion || !hit || index === null) return;
    const tones = this.tones(hit.warm);
    drawPixelRing(g, hit.point.x, hit.point.y, diameter * gemBallSpec.ringScale[index] / 2, grid,
      tones[Math.max(0, 2 - index)], gemBallSpec.ringAlpha[index]);
    if (accent === "wet-glint" && index < 3) {
      const length = [3, 5, 6][index] * grid;
      g.fillStyle(0xe0cda4, [.6, .4, .2][index]);
      const x = Math.round((hit.point.x - length / 2) / grid) * grid;
      const y = Math.round((hit.point.y + diameter / 2) / grid) * grid;
      g.fillRect(x, y, length, grid);
      g.fillRect(x + grid, y + grid * 2, length, grid);
    }
  }
}

/** 圆心与半径使用实际运动几何；将一段实线对准目标，避免落点恰好处于虚线间隙。 */
export function drawOrbitGuide(
  graphics: Phaser.GameObjects.Graphics,
  anchor: { x: number; y: number },
  target: { x: number; y: number },
  radius: number,
  color: number,
) {
  const count = Math.max(16, Math.round(Math.PI * 2 * radius / 12));
  const step = Math.PI * 2 / count, halfDash = step * .22;
  const targetAngle = Math.atan2(target.y - anchor.y, target.x - anchor.x);
  graphics.lineStyle(1, color, .42);
  for (let i = 0; i < count; i++) {
    const angle = targetAngle + i * step;
    graphics.beginPath();
    graphics.arc(anchor.x, anchor.y, radius, angle - halfDash, angle + halfDash);
    graphics.strokePath();
  }
}

/** Owns the two sprites, texture cache, sizing, identity, guides and transient feedback.
 * Effects draw into the shared map canvas so pixel-grid compositing and layer order stay consistent.
 */
export class OrbitBalls {
  private readonly primaryTexture: Phaser.Textures.CanvasTexture;
  private readonly warmTexture: Phaser.Textures.CanvasTexture;
  private readonly primaryBall: Phaser.GameObjects.Image;
  private readonly warmBall: Phaser.GameObjects.Image;
  private readonly pixelBallTextures: ReturnType<typeof createPixelBallTextures>;
  private readonly gemEffects: GemBallEffects;
  private readonly track: OrbitTrack;
  private readonly drawing: Phaser.GameObjects.Graphics;
  private colors!: ReturnType<typeof orbitMapStyle>["colors"];
  private pixel = false;
  private pixelCell = 3;
  private decoration?: "wet-glint";
  constructor(scene: Phaser.Scene, drawing: Phaser.GameObjects.Graphics, track: OrbitTrack, template: PixelBallTemplate) {
    this.drawing = drawing;
    this.track = track;
    this.pixelBallTextures = createPixelBallTextures(scene, template);
    this.gemEffects = new GemBallEffects(template);
    this.primaryTexture = scene.textures.createCanvas("orbit-map-primary", 96, 96)!;
    this.warmTexture = scene.textures.createCanvas("orbit-map-warm", 96, 96)!;
    this.primaryBall = scene.add.image(0, 0, this.primaryTexture);
    this.warmBall = scene.add.image(0, 0, this.warmTexture);
  }
  refreshTheme(theme: OrbitTheme) {
    const style = orbitMapStyle(theme);
    this.colors = style.colors;
    this.pixel = theme.material === "pixel";
    this.decoration = theme.material === "pixel" ? theme.ballDecoration : undefined;
    if (theme.material === "pixel") {
      this.primaryBall.setTexture(this.pixelBallTextures(false, theme.ballAppearance).key);
      this.warmBall.setTexture(this.pixelBallTextures(true, theme.ballAppearance).key);
    } else {
      this.paintBall(this.primaryTexture, this.colors.primary);
      this.paintBall(this.warmTexture, this.colors.warm);
      this.primaryBall.setTexture(this.primaryTexture.key);
      this.warmBall.setTexture(this.warmTexture.key);
    }
  }
  landingHighlight(frame: MapFrame) {
    return this.pixel ? this.gemEffects.landingHighlight(frame.visualTimeMs - frame.hit.at,
      (frame.hit.index + this.track.anchorOffset) % 2 === 1) : undefined;
  }
  private paintBall(texture: Phaser.Textures.CanvasTexture, color: number) {
    texture.setSmoothPixelArt(false);
    const ctx = texture.context, mid = texture.width / 2, radius = texture.width / 6;
    ctx.clearRect(0, 0, texture.width, texture.height);
    // 宽地块配哑光球：只保留柔和的上下明暗和近身阴影，不绘制玻璃高光或大光晕。
    const body = ctx.createLinearGradient(0, mid - radius, 0, mid + radius);
    body.addColorStop(0, hex(mix(color, 0xffffff, .07))); body.addColorStop(.5, hex(color));
    body.addColorStop(1, hex(mix(color, 0, .04)));
    ctx.save(); ctx.shadowColor = "#00000024"; ctx.shadowBlur = radius * .16; ctx.shadowOffsetY = radius * .08;
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(mid, mid, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = `${hex(mix(color, 0xffffff, .35))}60`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mid, mid, radius - .5, 0, Math.PI * 2); ctx.stroke();
    texture.refresh();
  }

  private ring(x: number, y: number, radius: number, color: number, alpha = 1, width = 2) {
    if (this.pixel) drawPixelRing(this.drawing, x, y, radius, this.pixelCell, color, alpha);
    else { this.drawing.lineStyle(width, color, alpha); this.drawing.strokeCircle(x, y, radius); }
  }

  draw(frame: MapFrame) {
    const { grid, gridX, gridY, spacing, point, points, pose, last, failed, landed } = frame;
    const c = this.colors, g = this.drawing;
    this.pixelCell = frame.symbols.cell;
    const roadWidth = spacing * (this.pixel ? pixelArtSpec.roadWidthRatio : .48);
    const radius = spacing * (this.pixel ? pixelArtSpec.ballRadiusRatio : .2);
    const displayRadius = this.pixel ? gemBallSize(grid, radius * 2).diameter / 2 : radius;
    const hitAge = frame.visualTimeMs - frame.hit.at;
    const hitWarm = (frame.hit.index + this.track.anchorOffset) % 2 === 1;
    const anchor = point(this.track.points[pose.anchor]);
    const moving = { x: anchor.x + Math.cos(pose.angle) * spacing, y: anchor.y + Math.sin(pose.angle) * spacing };
    if (this.pixel) {
      const start = pose.anchor === 0 ? (this.track.targets[0] ?? 0) - this.track.leadInBeats : this.track.targets[pose.anchor - 1];
      this.gemEffects.draw(g, {
        anchor, spacing, grid, diameter: displayRadius * 2, angle: pose.angle, direction: pose.direction,
        targetAngle: pose.anchor < this.track.targets.length ? this.track.angles[pose.anchor + 1] - Math.PI : null,
        movingWarm: pose.primaryAnchored, elapsedMs: Math.max(0, frame.timeMs - start * frame.beatMs),
        radiansPerMs: this.track.radiansPerBeat[pose.anchor] / frame.beatMs,
        motion: frame.motion, moving: pose.anchor < this.track.targets.length && ["playing", "count-in", "finishing"].includes(frame.snapshot.phase),
        hit: frame.hit.index > 0 && frame.hit.index <= this.track.targets.length
          ? { point: point(this.track.points[frame.hit.index]), age: hitAge, warm: hitWarm } : null,
      }, this.decoration);
    }
    if (!this.pixel && pose.anchor < this.track.targets.length) {
      const next = point(this.track.points[pose.anchor + 1]);
      drawOrbitGuide(g, anchor, next, spacing, c.mark);
    }
    if (frame.motion) {
      if (!this.pixel && pose.anchor < this.track.targets.length && (frame.snapshot.phase === "playing" || frame.snapshot.phase === "count-in" || frame.snapshot.phase === "finishing")) {
        const start = pose.anchor === 0 ? (this.track.targets[0] ?? 0) - this.track.leadInBeats : this.track.targets[pose.anchor - 1];
        const elapsed = Math.max(0, frame.timeMs / frame.beatMs - start);
        const tail = Math.min(elapsed, 160 / frame.beatMs);
        // 解析当前圆弧，不缓存上一帧位置；交换圆心时不可能连到另一颗球。
        for (let i = 0; i < 20; i++) {
          const from = pose.angle - pose.direction * this.track.radiansPerBeat[pose.anchor] * tail * (1 - i / 20);
          const to = pose.angle - pose.direction * this.track.radiansPerBeat[pose.anchor] * tail * (1 - (i + 1) / 20);
          const color = pose.primaryAnchored ? c.warm : c.primary;
          g.lineStyle(Math.max(1, roadWidth * .055), color, .04 + .3 * i / 20);
          g.beginPath(); g.arc(anchor.x, anchor.y, spacing, from, to, pose.direction === -1); g.strokePath();
        }
      }
      const age = frame.visualTimeMs - frame.hit.at;
      if (!this.pixel && age >= 0 && age < 240 && frame.hit.index < this.track.targets.length) {
        const hit = point(this.track.points[frame.hit.index]);
        this.ring(hit.x, hit.y, roadWidth * .55 + age * .035, c.primary, .55 * (1 - age / 240), 1.5);
      }
      const landing = frame.visualTimeMs - Math.max(frame.hit.at, (this.track.targets.at(-1) ?? 0) * frame.beatMs);
      if (landed && landing >= 0 && landing < ORBIT_LANDING_MS) {
        const amount = landing / ORBIT_LANDING_MS, end = points[last];
        this.ring(end.x, end.y, spacing * (.36 + .28 * (1 - (1 - amount) ** 3)), c.primary, .65 * (1 - amount));
      }
    }
    if (failed) {
      const target = points[this.track.anchorOffset + frame.snapshot.hits + 1], mark = spacing * .085;
      if (this.pixel) drawPixelGlyph(g, pixelGlyphs.close, target.x, target.y, this.pixelCell, c.error);
      else {
        g.lineStyle(Math.max(1.5, spacing * .026), c.error);
        g.lineBetween(target.x - mark, target.y - mark, target.x + mark, target.y + mark);
        g.lineBetween(target.x - mark, target.y + mark, target.x + mark, target.y - mark);
      }
      const age = frame.visualTimeMs - frame.terminalAt;
      if (frame.motion && age >= 0 && age < ORBIT_FAILURE_REVEAL_MS) {
        const amount = age / ORBIT_FAILURE_REVEAL_MS;
        const origin = frame.snapshot.failure === "late" ? target : moving;
        this.ring(origin.x, origin.y, spacing * (.24 + amount * .22), c.error, .8 * (1 - amount));
      }
    }
    const landingAge = frame.visualTimeMs - Math.max(frame.hit.at, (this.track.targets.at(-1) ?? 0) * frame.beatMs);
    const settle = frame.motion && landed && landingAge >= 0 && landingAge < ORBIT_LANDING_MS
      ? 1 + .045 * Math.sin(Math.PI * landingAge / ORBIT_LANDING_MS) : 1;
    const primary = pose.primaryAnchored ? anchor : moving, warm = pose.primaryAnchored ? moving : anchor;
    this.primaryBall.setPosition(primary.x + gridX, primary.y + gridY).setDisplaySize(displayRadius * 6 * settle, displayRadius * 6 * settle).setAlpha(failed ? .82 : 1);
    this.warmBall.setPosition(warm.x + gridX, warm.y + gridY).setDisplaySize(displayRadius * 6 * settle, displayRadius * 6 * settle).setAlpha(failed ? .82 : 1);
  }
}
