import { quarter } from "../game-content/levels/quarter/index";
import { eighth } from "../game-content/levels/eighth/index";
import { quarterEighth } from "../game-content/levels/quarter-eighth/index";
import { sixteenth } from "../game-content/levels/sixteenth/index";
import { eighthSixteenth } from "../game-content/levels/eighth-sixteenth/index";
import { eighthSixteenths } from "../game-content/levels/eighth-sixteenths/index";
import { sixteenthsEighth } from "../game-content/levels/sixteenths-eighth/index";
import { dottedEighth } from "../game-content/levels/dotted-eighth/index";
import { reverseDottedEighth } from "../game-content/levels/reverse-dotted-eighth/index";
import { smallSyncopation } from "../game-content/levels/small-syncopation/index";
import { triplet } from "../game-content/levels/triplet/index";
import { eighthTriplet } from "../game-content/levels/eighth-triplet/index";
import { comprehensive } from "../game-content/levels/comprehensive/index";
import { glimmer } from "../game-content/levels/glimmer/index";
import type { GameLevel } from "./core/GameLevel";
import { localLevels } from "../game-content/localLevels";

export const gameLevels: readonly GameLevel[] = [quarter, eighth, quarterEighth, sixteenth, eighthSixteenth,
  eighthSixteenths, sixteenthsEighth, dottedEighth, reverseDottedEighth, smallSyncopation, triplet, eighthTriplet, comprehensive, glimmer, ...localLevels];

const levelIds = new Set<string>();
for (const level of gameLevels) {
  if (levelIds.has(level.id)) throw new Error(`Duplicate game level ID: ${level.id}`);
  levelIds.add(level.id);
}

import { sharedThemes } from "../game-content/shared/themes";
export { DEFAULT_ORBIT_THEME } from "../game-content/shared/themes";
import type { OrbitTheme } from "./rendering/OrbitTheme";

export const orbitThemes: readonly OrbitTheme[] = [...new Map([...sharedThemes, ...gameLevels.flatMap(level => level.visualTheme ? [level.visualTheme] : [])].map(theme => [theme.id, theme])).values()];
export function getOrbitTheme(id: unknown): OrbitTheme {
  return orbitThemes.find(theme => theme.id === id) ?? orbitThemes[0];
}

import { images as sharedImages } from "../game-content/shared/assets";
export const gameImages = [...Object.values(sharedImages), ...gameLevels.flatMap(level => level.images ?? [])];

export { pixelAssets } from "../game-content/shared/assets";

export { default as soundFontBanks } from "../game-content/shared/audio/soundfonts.json";
