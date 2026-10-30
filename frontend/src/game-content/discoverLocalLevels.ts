import type { GameLevel } from "../game/core/GameLevel";

const modules = import.meta.glob<GameLevel>("/level-packs/levels/*/index.ts", {
  eager: true,
  import: "default",
});

export const localLevels: readonly GameLevel[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, level]) => {
    const directory = path.split("/").at(-2);
    if (!level || level.id !== directory || !level.title) {
      throw new Error(`${path}: export default a GameLevel whose id matches its directory`);
    }
    return level;
  });
