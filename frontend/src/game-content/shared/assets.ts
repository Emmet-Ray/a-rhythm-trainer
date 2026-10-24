import { ballTemplate } from "./ballTemplate";
import type { GameVisualAssets } from "../../game/rendering/OrbitMapView";
import type { GameImageAsset } from "../../game/core/GameAsset";

export const images = {
  "environment": {
    "url": "/assets/game/shared/practice-room.png",
    "width": 480,
    "height": 270,
    "source": "frontend/src/game-content/shared/art/practice-room.px.js",
    "output": "scenes/practice-room.png",
    "scale": 1
  },
} satisfies Record<string, GameImageAsset>;

export const pixelAssets: GameVisualAssets = {
  ballTemplate,
};
