import type { GameImageAsset } from "./GameAsset";
import type { OrbitVisualTimeline } from "../rendering/OrbitBackdrop";
import type { OrbitTheme } from "../rendering/OrbitTheme";
import type { MusicScore } from "./MusicScore";
import type { RhythmExercise } from "../../rhythm/RhythmModel";
import { createOrbitTrack, type OrbitSpeedChange } from "./OrbitTrack";

export type GameLevel = {
  /** Catalog grouping is independent of whether a level has an arranged score. */
  category?: "rhythm" | "music";
  visualTheme?: OrbitTheme;
  images?: readonly GameImageAsset[];
  visualTimeline?: OrbitVisualTimeline;
  id: string; title: string; description: string; speedChanges?: readonly OrbitSpeedChange[];
  twirlTiles: readonly number[];
} & ({ exercise: RhythmExercise; music?: MusicScore } | { exercise?: never; music: MusicScore });

/** 统一选择关卡的节奏来源与转速事件；页面无需了解图片曲谱的延音表示。 */
export function createLevelTrack(level: GameLevel) {
  return createOrbitTrack(level.exercise ?? level.music, level.twirlTiles, level.speedChanges);
}
