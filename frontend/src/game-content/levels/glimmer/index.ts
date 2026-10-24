import type { GameLevel } from "../../../game/core/GameLevel";
import { exercise, music } from "./score";
import { twirlTilesAtBeats } from "../../../game/core/OrbitTrack";

import type { GameImageAsset } from "../../../game/core/GameAsset";
import type { OrbitTheme } from "../../../game/rendering/OrbitTheme";

const background = {
  url: "/assets/game/levels/glimmer/dusk-field.png", width: 480, height: 270,
  source: "frontend/src/game-content/levels/glimmer/art/glimmer.px.js",
  output: "scenes/dusk-field.png", scale: 1,
} satisfies GameImageAsset;

const theme: OrbitTheme = {
  material: "pixel", id: "pixel-glimmer", title: "像素 · 暮野萤光",
  description: "天边一线余晖，田野上几点萤火。",
  pixelEnvironment: { image: background.url, cropX: .78, dimOpacity: .18 },
  stage: 0x1c2433,
  roadMaterial: {
    geometry: "plain", palette: { shadow: 0x2c3038, face: 0x55585e, edge: 0x9a8f80, mark: 0xe8d79a },
    joint: 0x2c3038, landing: 0xe8d79a, finishMark: 0xe8d79a, signPlate: false,
  },
};

const route = {
  twirlTiles: twirlTilesAtBeats(exercise, [
    // 第 1—4 小节保持四分直路，第 5—8 小节用二平均逐步展开。
    16.5, 17.5, 21.5, 22.5, 24.5, 25.5, 26.5, 27.5, 28.5, 29.5,
    // 第 9—12 小节：密集段先向右、第 10 小节折向左；第 11 小节后两拍
    // 向右展开以避开来路，再以二平均方波收束。连续四平均保留内部反转。
    32.5, 33.5, 34, 34.25, 34.5, 34.75, 35, 35.25, 35.5, 35.75, 36,
    37, 37.25, 37.5, 37.75, 38, 38.5, 39, 39.25, 39.5, 39.75,
    40, 40.25, 40.5, 40.75, 41, 41.25, 41.5, 41.75, 42, 43, 43.5,
    44, 44.5, 45.5, 46.5, 47.5,
    // 第 13—16 小节回到疏一些的二平均，最后落回四分直路。
    48, 48.5, 49, 49.5, 53, 53.5, 54, 54.5, 56, 56.5, 57, 57.5,
  ]),
};

export const glimmer = {
  id: "glimmer", title: "微光", description: "从稳定四分逐步进入二平均与四平均，再回到基本拍",
  ...route,
  exercise, music, visualTheme: theme, images: [background],
} satisfies GameLevel;
