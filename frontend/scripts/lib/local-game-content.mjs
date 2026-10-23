import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const frontendRoot = fileURLToPath(new URL('../../', import.meta.url));

// A real empty module is the fallback, so tools without Vite config stay public.
// Only this exact catalog import may be replaced; no private imports in core code.
export function localGameContentAliases(enabled, root = frontendRoot) {
  return enabled ? [{
    find: '../game-content/localLevels',
    replacement: path.join(root, 'src/game-content/discoverLocalLevels.ts'),
  }] : [];
}

export function localGameContentEnabled(value = process.env.GAME_LOCAL_CONTENT) {
  if (value !== undefined && value !== '0' && value !== '1') {
    throw new Error('GAME_LOCAL_CONTENT must be 0 (public) or 1 (include local content)');
  }
  return value !== '0';
}
