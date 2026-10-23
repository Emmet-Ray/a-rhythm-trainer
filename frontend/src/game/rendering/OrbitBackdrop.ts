import { drawRhythmPosters } from "./RhythmPosters";
import type Phaser from "phaser";
import type { OrbitTrack } from "../core/OrbitTrack";
import { orbitStageColor, themeHex as hex, type OrbitTheme, type OrbitThemeId } from "./OrbitTheme";

/** Cover framing for an authored scene: 0 selects the top/left edge, 1 the bottom/right.
 * Defaults preserve existing top-aligned scenes; each artwork owns its safe composition.
 */
export type BackdropImage = { image: string; cropX: number; cropY?: number };
export function backdropFrame(sourceWidth: number, sourceHeight: number, width: number, height: number, cropX: number, cropY = 0) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const displayWidth = sourceWidth * scale, displayHeight = sourceHeight * scale;
  return { x: (width - displayWidth) * cropX, y: (height - displayHeight) * cropY, width: displayWidth, height: displayHeight };
}


export type VisualScene = BackdropImage;
/** Original score measure indexes, including pickup. Transition duration is measured in bars.
 * A sequence belongs to a level and only runs under its designated theme.
 */
export type OrbitVisualTimeline = {
  theme: OrbitThemeId;
  scenes: readonly [VisualScene & { measure: 0 }, ...(VisualScene & { measure: number; transitionMeasures: number })[]];
};

/** Stateless seeking from the audio-clock position. Works with partial/unequal pickup bars,
 * repeat attempts and frame skips; no wall-clock timers or accumulated animation state.
 */
export function visualSceneAt(timeline: OrbitVisualTimeline, track: OrbitTrack, beat: number, motion: boolean) {
  const local = Math.max(0, Math.min(beat, track.durationBeats));
  const i = Math.min(track.measureStarts.length - 2, Math.max(0, track.measureStarts.findLastIndex(start => start <= local)));
  const length = track.measureStarts[i + 1] - track.measureStarts[i];
  const position = track.range.startMeasure + i + (local - track.measureStarts[i]) / length;
  const index = Math.max(0, timeline.scenes.findLastIndex(scene => scene.measure <= position));
  const current = timeline.scenes[index], previous = timeline.scenes[Math.max(0, index - 1)];
  const duration = 'transitionMeasures' in current ? current.transitionMeasures : 0;
  const progress = !motion || duration <= 0 ? 1 : Math.min(1, (position - current.measure) / duration);
  return { previous, current, mix: progress * progress * (3 - 2 * progress) };
}
/** Two preloaded image layers crossfade in score time. No canvas uploads per frame. */
class OrbitVisualBackdrop {
  private readonly layers: Phaser.GameObjects.Image[];
  private readonly timeline?: OrbitVisualTimeline;
  constructor(scene: Phaser.Scene, timeline?: OrbitVisualTimeline) {
    this.timeline = timeline;
    this.layers = timeline ? [scene.add.image(0, 0, timeline.scenes[0].image), scene.add.image(0, 0, timeline.scenes[0].image)] : [];
    this.layers.forEach(layer => layer.setOrigin(0).setVisible(false));
  }
  draw(theme: OrbitThemeId, track: OrbitTrack, beat: number, motion: boolean, width: number, height: number) {
    const active = this.timeline?.theme === theme;
    this.layers.forEach(layer => layer.setVisible(active));
    if (!active || !this.timeline) return false;
    const frame = visualSceneAt(this.timeline, track, beat, motion);
    const place = (layer: Phaser.GameObjects.Image, scene: VisualScene, alpha: number) => {
      if (layer.texture.key !== scene.image) layer.setTexture(scene.image);
      layer.texture.setSmoothPixelArt(true);
      const bounds = backdropFrame(layer.width, layer.height, width, height, scene.cropX, scene.cropY);
      layer.setPosition(bounds.x, bounds.y).setDisplaySize(bounds.width, bounds.height).setAlpha(alpha);
    };
    place(this.layers[0], frame.previous, 1);
    place(this.layers[1], frame.current, frame.mix);
    return true;
  }
}

/** Owns static and score-timed scenery, cropping, dimming and edge fade.
 * draw returns the background pixel grid; foreground renderers need no image/transition details.
 * All textures and objects belong to the scene and are released with it.
 */
export class OrbitBackdrop {
  static preload(scene: Phaser.Scene, themes: readonly OrbitTheme[], timeline?: OrbitVisualTimeline) {
    const images = new Set(timeline?.scenes.map(scene => scene.image));
    for (const theme of themes) if (theme.material === "pixel") images.add(theme.pixelEnvironment.image);
    for (const image of images) scene.load.image(image, image);
  }
  private readonly backdropTexture: Phaser.Textures.CanvasTexture;
  private readonly backdrop: Phaser.GameObjects.Image;
  private readonly visualBackdrop: OrbitVisualBackdrop;
  private readonly backdropShade: Phaser.GameObjects.Graphics;
  private readonly fadeTexture: Phaser.Textures.CanvasTexture;
  private readonly fade: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private theme!: OrbitTheme;
  private cropX = .85;
  private cropY = 0;
  constructor(scene: Phaser.Scene, timeline?: OrbitVisualTimeline) {
    this.scene = scene;
    this.backdropTexture = scene.textures.createCanvas("orbit-environment", 1024, 512)!;
    this.backdrop = scene.add.image(0, 0, this.backdropTexture).setOrigin(0);
    this.visualBackdrop = new OrbitVisualBackdrop(scene, timeline);
    this.backdropShade = scene.add.graphics();
    this.fadeTexture = scene.textures.createCanvas("orbit-map-fade", 256, 256)!;
    // Edge fade belongs to the background but must cover every foreground object.
    this.fade = scene.add.image(0, 0, this.fadeTexture).setOrigin(0).setDepth(1);
  }
  refreshTheme(theme: OrbitTheme) {
    this.theme = theme;
    const pixel = theme.material === "pixel";
    if (pixel) { this.cropX = theme.pixelEnvironment.cropX; this.cropY = theme.pixelEnvironment.cropY ?? 0; }
    // 静态环境仅在切换主题时栅格化，避免每帧绘制渐变和岩层。
    const source = theme.material === "pixel" ? this.scene.textures.get(theme.pixelEnvironment.image).getSourceImage() : null;
    // Use the source grid directly; do not introduce an intermediate resampling step.
    this.backdropTexture.setSize(source?.width ?? 1024, source?.height ?? 512);
    const bg = this.backdropTexture.context;
    const w = this.backdropTexture.width, h = this.backdropTexture.height;
    bg.fillStyle = hex(orbitStageColor(theme)); bg.fillRect(0, 0, w, h);
    if (theme.material === "matte") {
      const env = theme.environment;
      const glow = bg.createRadialGradient(w * env.lightX, h * env.lightY, 0, w * env.lightX, h * env.lightY, w * .7);
      glow.addColorStop(0, hex(env.light)); glow.addColorStop(1, hex(env.light) + "00");
      bg.globalAlpha = env.strength; bg.fillStyle = glow; bg.fillRect(0, 0, w, h);
      bg.globalAlpha = .12; bg.strokeStyle = hex(env.contour); bg.lineWidth = 1;
      for (let layer = 0; layer < 7; layer++) {
        const y = h * .88 + layer * 12;
        bg.beginPath(); bg.moveTo(0, y);
        bg.bezierCurveTo(w * .2, y - 75, w * .3, y + 65, w * .52, y);
        bg.bezierCurveTo(w * .72, y - 55, w * .84, y - 25, w, y - 95);
        bg.stroke();
      }
      bg.globalAlpha = 1;
    }
    if (theme.material === "pixel") {
      bg.save(); bg.imageSmoothingEnabled = false;
      bg.drawImage(source as HTMLImageElement, 0, 0, w, h);
      drawRhythmPosters(bg, theme.pixelEnvironment.posters ?? []);
      bg.restore();
    }
    this.backdropTexture.setSmoothPixelArt(pixel);
    this.backdropTexture.refresh();
    this.backdrop.setTexture(this.backdropTexture.key);
    const ctx = this.fadeTexture.context, size = this.fadeTexture.width, base = hex(orbitStageColor(theme));
    ctx.clearRect(0, 0, size, size);
    for (const vertical of [false, true]) {
      const gradient = ctx.createLinearGradient(0, 0, vertical ? 0 : size, vertical ? size : 0);
      gradient.addColorStop(0, base); gradient.addColorStop(vertical ? .12 : .055, `${base}00`);
      gradient.addColorStop(vertical ? .88 : .945, `${base}00`); gradient.addColorStop(1, base);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
    }
    this.fadeTexture.refresh();
  }
  draw(track: OrbitTrack, beat: number, motion: boolean, width: number, height: number) {
    const theme = this.theme, pixel = theme.material === "pixel";
    const bounds = backdropFrame(this.backdropTexture.width, this.backdropTexture.height, width, height, this.cropX, this.cropY);
    this.backdropShade.clear().fillStyle(orbitStageColor(theme), pixel ? theme.pixelEnvironment.dimOpacity : 0).fillRect(0, 0, width, height);
    if (pixel) this.backdrop.setPosition(bounds.x, bounds.y).setDisplaySize(bounds.width, bounds.height);
    else this.backdrop.setPosition(0, 0).setDisplaySize(width, height);
    this.backdrop.setVisible(!this.visualBackdrop.draw(theme.id, track, beat, motion, width, height));
    this.fade.setDisplaySize(width, height).setVisible(!pixel);
    const grid = pixel ? bounds.width / this.backdropTexture.width : 1;
    return {
      grid,
      gridX: pixel ? ((bounds.x % grid) + grid) % grid - grid : 0,
      gridY: pixel ? ((bounds.y % grid) + grid) % grid - grid : 0,
    };
  }
}
