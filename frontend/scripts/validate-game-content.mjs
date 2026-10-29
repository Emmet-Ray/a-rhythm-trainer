import { createServer } from 'vite';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateGameAssets } from './lib/game-assets.mjs';
import { localGameContentAliases } from './lib/local-game-content.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const local = process.argv.includes('--local');
const server = await createServer({ configFile: false, resolve: { alias: localGameContentAliases(local) }, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { gameLevels, orbitThemes, gameImages } = await server.ssrLoadModule('/src/game/catalog.ts');
  const { soundFontBanks } = await server.ssrLoadModule('/src/game/catalog.ts');
  const { createLevelTrack } = await server.ssrLoadModule('/src/game/core/GameLevel.ts');
  const { compileMultipartScore } = await server.ssrLoadModule('/src/game/core/MultipartScore.ts');
  const errors = await validateGameAssets({ repository, images: gameImages, banks: soundFontBanks, local });
  const ids = new Set(), imageUrls = new Set(gameImages.map(image => image.url));
  const themes = new Map(orbitThemes.map(theme => [theme.id, theme]));
  const checkImage = url => { if (!imageUrls.has(url)) errors.push(`Image reference has no declaration: ${url}`); };
  for (const theme of orbitThemes) if (theme.material === 'pixel') {
    checkImage(theme.pixelEnvironment.image);
    for (const key of ['pastRoadAlpha', 'ballFeedback', 'roadPalette', 'colors', 'text', 'muted', 'success', 'buttonBase', 'environment']) {
      if (key in theme) errors.push(`Pixel theme ${theme.id} overrides retired/shared field: ${key}`);
    }
    if (!theme.roadMaterial?.palette) errors.push(`Pixel theme ${theme.id} must declare its road material`);
  }
  for (const level of gameLevels) {
    if (ids.has(level.id)) errors.push(`Duplicate level ID: ${level.id}`);
    ids.add(level.id);
    if (level.visualTheme && themes.get(level.visualTheme.id) !== level.visualTheme) errors.push(`Conflicting theme: ${level.id}`);
    try {
      const track = createLevelTrack(level);
      if (level.music) {
        const performance = compileMultipartScore(level.music), targets = performance.hits.map(h=>h.beat);
        if (!soundFontBanks.some(bank=>bank.file===level.music.soundFont.file)) throw Error('undeclared soundfont');
        if (track.targets.length !== targets.length) throw Error('targets and music hit map differ');
        track.targets.forEach((beat,index)=>{if(Math.abs(beat-targets[index])>1e-8)throw Error(`target ${index} and music hit map differ`);});
      }
      const timeline = level.visualTimeline;
      if (timeline) {
        if (!themes.has(timeline.theme)) throw Error('timeline theme is not registered');
        timeline.scenes.forEach((scene, index) => {
          checkImage(scene.image);
          if (scene.measure < 0 || scene.measure >= track.range.endMeasure || !Number.isInteger(scene.measure)
            || (index === 0 ? scene.measure !== 0 : scene.measure <= timeline.scenes[index - 1].measure || !(scene.transitionMeasures > 0)))
            throw Error('invalid scene boundary/transition');
        });
      }
    } catch (error) { errors.push(`${level.id}: ${error.message}`); }
  }
  const folders = await readdir(new URL('../src/game-content/levels/', import.meta.url), { withFileTypes: true });
  if (local) {
    const localFolders = await readdir(new URL('../local-content/levels/', import.meta.url), { withFileTypes: true })
      .catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    folders.push(...localFolders);
  }
  for (const folder of folders.filter(entry => entry.isDirectory())) if (!ids.has(folder.name)) errors.push(`Unregistered level directory: ${folder.name}`);
  for (const id of ids) if (!folders.some(folder => folder.isDirectory() && folder.name === id)) errors.push(`Level has no owning directory: ${id}`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Game content verified: ${ids.size} levels, ${themes.size} themes, ${gameImages.length} images, ${soundFontBanks.length} soundfonts.`);
} finally { await server.close(); }
