import { TRANSPARENT } from "../src/core/color.ts";
import { PxError } from "../src/core/errors.ts";
import type { Project } from "../src/core/project.ts";
import { loadSource } from "../src/node/load.ts";

/** Palette prelude on line 1 (no newline), so test sources keep their own line numbers. */
export const PAL = 'use("pico8"); pal({ k: 0, r: 8, w: 7, g: 11 }); ';

/** Build `name` from source and return its pixels as palette-key rows. */
export function art(src: string, name: string, trace = false): string {
  const p = loadSource(src, "t.px.js", { trace });
  return keys(p, name);
}

export function keys(p: Project, name: string): string {
  const img = p.image(name);
  const rev = p.assets.get(name)!.pal.reverse();
  const rows: string[] = [];
  for (let y = 0; y < img.h; y++) {
    let r = "";
    for (let x = 0; x < img.w; x++) {
      const c = img.data[y * img.w + x];
      r += c === TRANSPARENT ? "." : rev.get(c) ?? "?";
    }
    rows.push(r);
  }
  return rows.join("\n");
}

/** The error thrown while loading + building `name`. */
export function failure(src: string, name?: string): PxError {
  try {
    const p = loadSource(src, "t.px.js");
    if (name) p.image(name);
  } catch (e) {
    if (e instanceof PxError) return e;
    throw new Error("expected a PxError, got " + String(e));
  }
  throw new Error("expected a failure");
}
