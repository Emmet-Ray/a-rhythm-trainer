/** Authored image and its reproducible pxl output. Paths to source files are repository-relative;
 * URL paths are public assets. Rendering only consumes URL/size; tooling owns source/output/scale. */
export type GameImageAsset = {
  url: string; width: number; height: number;
  source: string; output: string; scale: number;
};
