// Normal maps: per-pixel surface directions that make lighting() rake across relief (bricks,
// domes, bevels) instead of lighting everything flat. Generated from shape (bump) or painted
// with numpad direction grids (normals); stored on the image (Img.norm) so they travel with it.
import { TRANSPARENT, pack } from "./color.ts";
import { PxError } from "./errors.ts";
import { Img } from "./image.ts";
import type { BumpOpts } from "./model.ts";

/** Write normal (nx, ny, nz) (any length, ny pointing down) for pixel i; nz is kept >= ~0. */
export function setNormal(n: Int8Array, i: number, nx: number, ny: number, nz: number): void {
  const len = Math.hypot(nx, ny, nz) || 1;
  n[i * 3] = Math.round((nx / len) * 127);
  n[i * 3 + 1] = Math.round((ny / len) * 127);
  n[i * 3 + 2] = Math.max(1, Math.round((nz / len) * 127)); // 0 is "no normal"
}

/**
 * Numpad directions for normals() grids: the way the surface faces. 8 = up, 3 = down-right,
 * 5 = straight at the viewer; lowercase-style softer tilts use the shifted row (q w e / a s d / z x c).
 */
const DIRS: Record<string, [number, number, number]> = {};
const steep = 1, soft = 0.4;
for (const [keys, t] of [["789456123", steep], ["qweasdzxc", soft]] as const)
  [...keys].forEach((ch, k) => {
    const dx = (k % 3) - 1, dy = Math.floor(k / 3) - 1;
    DIRS[ch] = [dx * t, dy * t, 1];
  });

/** Normal for a direction grid char, null = skip ("." / space), "none" = clear ("0"). */
export function dirOf(ch: string): [number, number, number] | null | "none" {
  if (ch === "." || ch === " ") return null;
  if (ch === "0") return "none";
  const d = DIRS[ch];
  if (!d) throw new PxError(`normals: unknown direction '${ch}' (numpad 1-9 steep, qweasdzxc soft, 0 clears, . skips)`);
  return d;
}

/**
 * Generate normals over `mask` pixels from a height field:
 * - "bevel": edges slope down over `w` px, flat top (bricks, panels, buttons)
 * - "dome": each connected blob bulges like a pillow / sphere (barrels, fruit, rocks)
 * - "luma": brighter = higher, from the art's own shading (hand-shaded sprites)
 * Pixels outside the mask (and outside the image) count as height 0 for bevel/dome.
 */
export function bump(img: Img, mask: Uint8Array, o: BumpOpts): void {
  const { w, h } = img, n = w * h;
  const shape = o.shape ?? "dome", depth = o.depth ?? 1;
  const ht = new Float32Array(n);
  if (shape === "luma") {
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const c = img.data[i];
      ht[i] = (0.3 * (c >>> 24) + 0.59 * ((c >>> 16) & 255) + 0.11 * ((c >>> 8) & 255)) / 255 * 4;
    }
  } else if (shape === "bevel" || shape === "dome") {
    const d = distance(mask, w, h);
    if (shape === "bevel") {
      const bw = Math.max(1, o.w ?? 2);
      for (let i = 0; i < n; i++) ht[i] = Math.min(d[i], bw);
    } else {
      // Per blob: a circular profile over its own deepest distance.
      const blob = new Int32Array(n).fill(-1), peak: number[] = [];
      for (let s = 0; s < n; s++) {
        if (!mask[s] || blob[s] >= 0) continue;
        const id = peak.length, stack = [s];
        let top = 0;
        blob[s] = id;
        while (stack.length) {
          const i = stack.pop()!, x = i % w;
          top = Math.max(top, d[i]);
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
            if (j >= 0 && j < n && mask[j] && blob[j] < 0) { blob[j] = id; stack.push(j); }
        }
        peak.push(top);
      }
      for (let i = 0; i < n; i++) {
        if (!mask[i]) continue;
        const R = peak[blob[i]], t = 1 - d[i] / (R + 0.5);
        ht[i] = (R + 0.5) * Math.sqrt(Math.max(0, 1 - t * t));
      }
    }
  } else throw new PxError(`bump shape must be "bevel", "dome" or "luma", got '${shape}'`);

  const nm = img.normals();
  const at = (x: number, y: number, i: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return shape === "luma" ? ht[i] : 0;
    const j = y * w + x;
    return mask[j] ? ht[j] : shape === "luma" ? ht[i] : 0;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const gx = (at(x + 1, y, i) - at(x - 1, y, i)) / 2, gy = (at(x, y + 1, i) - at(x, y - 1, i)) / 2;
      setNormal(nm, i, -gx * depth, -gy * depth, 1);
    }
}

/** Chamfer distance (1, √2) from each mask pixel to the nearest non-mask pixel or the border. */
function distance(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h), D = Math.SQRT2;
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + D, get(x + 1, y - 1) + D);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + D, get(x - 1, y + 1) + D);
    }
  return d;
}

/**
 * The normal map as an image in the common game-engine encoding (Godot, Unity, LDtk...):
 * RGB = normal * 0.5 + 0.5 with green pointing up; flat (128, 128, 255) where none was set.
 */
export function normalImage(img: Img): Img {
  const out = new Img(img.w, img.h), n = img.norm;
  for (let i = 0; i < img.data.length; i++) {
    if (img.data[i] === TRANSPARENT) continue;
    const has = n && n[i * 3 + 2] > 0;
    const nx = has ? n![i * 3] / 127 : 0, ny = has ? n![i * 3 + 1] / 127 : 0, nz = has ? n![i * 3 + 2] / 127 : 1;
    const b = (v: number) => Math.min(255, Math.max(0, Math.round((v * 0.5 + 0.5) * 255)));
    out.data[i] = pack(b(nx), b(-ny), b(nz), 255);
  }
  return out;
}
