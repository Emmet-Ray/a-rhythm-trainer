import type { PartPreset } from "../../../game/core/MultipartScore";

export const generalUserFile = "/assets/game/shared/audio/generaluser-gs/GeneralUser-GS.sf2";
/** Convenient names, not a closed list: parts may also specify bank/program directly. */
export const generalUserPresets = {
  piano: { kind: "melodic", program: 0 },
  electricPiano: { kind: "melodic", program: 4 },
  nylonGuitar: { kind: "melodic", program: 24 },
  fingerBass: { kind: "melodic", program: 33 },
  violin: { kind: "melodic", program: 40 },
  cello: { kind: "melodic", program: 42 },
  standardDrums: { kind: "drums", program: 0 },
} as const satisfies Record<string, PartPreset>;
