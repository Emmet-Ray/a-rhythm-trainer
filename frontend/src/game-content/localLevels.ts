import type { GameLevel } from "../game/core/GameLevel";

// Public builds and isolated tests have no dependency on optional local files.
// Vite replaces this module only when local content is enabled.
export const localLevels: readonly GameLevel[] = [];
