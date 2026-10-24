import Phaser from "phaser";
import { OrbitBackdrop, type OrbitVisualTimeline } from "./OrbitBackdrop";
import { OrbitBalls, type PixelBallTemplate } from "./OrbitBalls";
import { OrbitRoad } from "./OrbitRoad";
import { createOrbitMapCamera } from "./OrbitMapCamera";
import { pixelMapMetrics } from "./PixelDrawing";
import { orbitPose, type OrbitTrack } from "../core/OrbitTrack";
import type { OrbitTheme } from "./OrbitTheme";
import type { OrbitFrame } from "../runtime/OrbitSession";

type Point = { x: number; y: number };
type Frame = OrbitFrame & { motion: boolean };
export type GameVisualAssets = { ballTemplate: PixelBallTemplate };
/** Projected frame shared by road and balls; all positions are relative to the background grid origin. */
export type MapFrame = Frame & {
  width: number; height: number; grid: number; gridX: number; gridY: number;
  spacing: number; symbols: ReturnType<typeof pixelMapMetrics>; point: (point: Point) => Point; points: Point[];
  pose: ReturnType<typeof orbitPose>; current: number; last: number; failed: boolean; landed: boolean;
};

/** Scene composition: projects the track once and orders background, road and ball rendering.
 * Subsystems own their textures, style and drawing policy; the map owns grid compositing.
 */
export class OrbitMapView {
  static preload(scene: Phaser.Scene, themes: readonly OrbitTheme[], timeline?: OrbitVisualTimeline) {
    OrbitBackdrop.preload(scene, themes, timeline);
  }
  private readonly scene: Phaser.Scene;
  private readonly track: OrbitTrack;
  private readonly camera: ReturnType<typeof createOrbitMapCamera>;
  private readonly backdrop: OrbitBackdrop;
  private readonly road: OrbitRoad;
  private readonly balls: OrbitBalls;
  private readonly drawing: Phaser.GameObjects.Graphics;
  private readonly pastLayer: Phaser.GameObjects.RenderTexture;
  private readonly mapLayer: Phaser.GameObjects.RenderTexture;
  private pixel = false;
  constructor(scene: Phaser.Scene, track: OrbitTrack, assets: GameVisualAssets, timeline?: OrbitVisualTimeline) {
    this.scene = scene;
    this.track = track;
    this.camera = createOrbitMapCamera(track);
    this.backdrop = new OrbitBackdrop(scene, timeline);
    this.drawing = scene.add.graphics();
    this.pastLayer = scene.add.renderTexture(0, 0, 1, 1).setOrigin(0).setVisible(false);
    this.pastLayer.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.mapLayer = scene.add.renderTexture(0, 0, 1, 1).setOrigin(0).setVisible(false);
    this.mapLayer.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.road = new OrbitRoad(scene, this.drawing, track);
    this.balls = new OrbitBalls(scene, this.drawing, track, assets.ballTemplate);
  }
  refreshTheme(theme: OrbitTheme) {
    this.pixel = theme.material === "pixel";
    this.backdrop.refreshTheme(theme);
    this.road.refreshTheme(theme);
    this.balls.refreshTheme(theme);
  }
  private compositeMap(grid: number, gridX: number, gridY: number, width: number, height: number, layer = this.mapLayer) {
    this.drawing.setVisible(!this.pixel).setScale(this.pixel ? 1 / grid : 1);
    layer.setVisible(this.pixel);
    if (!this.pixel) return;
    const columns = Math.ceil((width - gridX) / grid), rows = Math.ceil((height - gridY) / grid);
    if (layer.width !== columns || layer.height !== rows) layer.resize(columns, rows);
    layer.setPosition(gridX, gridY).setScale(grid);
    layer.clear().draw(this.drawing).render();
  }

  draw(frame: Frame) {
    const { width, height } = this.scene.scale;
    if (width <= 0 || height <= 0) return;
    const { grid, gridX, gridY } = this.backdrop.draw(this.track, frame.timeMs / frame.beatMs, frame.motion, width, height);
    const camera = this.camera(frame.timeMs, frame.beatMs, width, height), spacing = camera.spacing;
    const point = (p: Point) => ({ x: camera.x - gridX + p.x * spacing, y: camera.y - gridY + p.y * spacing });
    const pose = orbitPose(frame.timeMs, frame.beatMs, this.track, frame.snapshot.hits);
    const projected: MapFrame = {
      ...frame, width, height, grid, gridX, gridY, spacing, point, pose,
      symbols: pixelMapMetrics(width, grid),
      points: this.track.map.points.map(point),
      current: this.track.anchorOffset + pose.anchor,
      last: this.track.anchorOffset + this.track.targets.length,
      failed: frame.snapshot.phase === "failing" || frame.snapshot.phase === "failed",
      landed: pose.anchor === this.track.targets.length,
    };
    this.drawing.clear();
    this.pastLayer.setVisible(false);
    this.road.draw(projected, this.balls.landingHighlight(projected), alpha => {
      this.pastLayer.setAlpha(alpha);
      this.compositeMap(grid, gridX, gridY, width, height, this.pastLayer);
    });
    this.balls.draw(projected);
    this.compositeMap(grid, gridX, gridY, width, height);
  }
}
