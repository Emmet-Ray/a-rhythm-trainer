import type { GameVisualAssets } from "./OrbitMapView";
import type { SampleBank } from "../audio/GameInstruments";
import Phaser from "phaser";
import type { OrbitVisualTimeline } from "./OrbitBackdrop";
import type { OrbitTheme } from "./OrbitTheme";
import type { MusicScore } from "../core/MusicScore";
import type { OrbitTrack } from "../core/OrbitTrack";
import { OrbitMapView } from "./OrbitMapView";
import { createOrbitSession, type OrbitPlaybackSnapshot } from "../runtime/OrbitSession";

type Options = {
  track: OrbitTrack;
  theme: OrbitTheme;
  themes: readonly OrbitTheme[];
  pixelAssets: GameVisualAssets;
  sampleBank: SampleBank;
  visualTimeline?: OrbitVisualTimeline;
  music?: MusicScore;
  parent: HTMLElement;
  onChange: (snapshot: OrbitPlaybackSnapshot) => void;
  onReady: () => void;
  acquirePlayback: (stop: () => void) => () => void;
};

/** 浏览器舞台拥有 Phaser、尺寸监听与主题；本局运行完全由 session 管理。 */
export function createOrbitGame(options: Options) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const session = createOrbitSession(options);
  let disposed = false;
  let theme = options.theme;
  let mapView: OrbitMapView | undefined;

  class OrbitScene extends Phaser.Scene {
    private map!: OrbitMapView;
    preload() { OrbitMapView.preload(this, options.themes, options.visualTimeline); }
    create() {
      this.map = new OrbitMapView(this, options.track, options.pixelAssets, options.visualTimeline);
      mapView = this.map;
      this.map.refreshTheme(theme);
      resizeSurface();
      if (!disposed) options.onReady();
    }
    update() {
      if (disposed) return;
      this.map.draw({ ...session.readFrame(), motion: !reducedMotion.matches });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: options.parent, transparent: true, banner: false,
    audio: { noAudio: true }, autoFocus: false,
    input: { keyboard: false, mouse: false, touch: false },
    scale: { mode: Phaser.Scale.NONE, width: Math.max(1, options.parent.clientWidth), height: Math.max(1, options.parent.clientHeight), expandParent: false },
    scene: OrbitScene,
  });
  function resizeSurface() {
    const { clientWidth, clientHeight } = options.parent;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    game.scale.resize(clientWidth, clientHeight);
    game.canvas.style.width = `${clientWidth}px`;
    game.canvas.style.height = `${clientHeight}px`;
  }

  const resize = new ResizeObserver(resizeSurface);
  resize.observe(options.parent);

  return {
    start: session.start,
    tap: session.tap,
    stop: session.stop,
    /** 原位更新材质，不重建路线、相机或音频状态。 */
    setTheme(next: OrbitTheme) {
      if (disposed) return;
      theme = next;
      mapView?.refreshTheme(theme);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.dispose();
      resize.disconnect();
      game.destroy(true);
    },
  };
}
export type OrbitGame = ReturnType<typeof createOrbitGame>;
