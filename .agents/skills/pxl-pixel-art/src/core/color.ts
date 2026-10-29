// Colors are packed 0xRRGGBBAA unsigned integers. 0 is fully transparent.
export type Color = number;

export const TRANSPARENT: Color = 0;

export function pack(r: number, g: number, b: number, a = 255): Color {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function channels(c: Color): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

/** "#rgb", "#rgba", "#rrggbb", "#rrggbbaa" (leading # optional). */
export function parseHex(s: string): Color | undefined {
  let h = s.startsWith("#") ? s.slice(1) : s;
  if (!/^[0-9a-fA-F]+$/.test(h)) return undefined;
  if (h.length === 3 || h.length === 4) h = h.replace(/./g, (d) => d + d);
  if (h.length === 6) h += "ff";
  if (h.length !== 8) return undefined;
  const c = parseInt(h, 16) >>> 0;
  return (c & 255) === 0 ? TRANSPARENT : c;
}

export function toHex(c: Color): string {
  const [r, g, b, a] = channels(c);
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b) + (a === 255 ? "" : h(a));
}

/** Darken toward black by k (0..1); result is opaque. */
export function darken(c: Color, k: number): Color {
  const [r, g, b] = channels(c);
  return pack(r * (1 - k), g * (1 - k), b * (1 - k));
}
