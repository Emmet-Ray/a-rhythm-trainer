import { images } from "./assets";
import type { OrbitTheme } from "../../game/rendering/OrbitTheme";

export const sharedThemes: readonly OrbitTheme[] = [
{
    material: "matte", id: "daybreak", title: "晨砂", description: "暖灰岩层与柔和晨光，开阔、安静。",
    colors: { primary: 0x237c77, warm: 0xc38642, road: 0xc5bba7, edge: 0xa99d87, seam: 0xe9e1d2, mark: 0x665f50, past: 0xdcd5c8, stage: 0xeee9df, error: 0xb3433f, onPrimary: 0xffffff },
    text: "#343d39", muted: "#656d64", success: "#387353", buttonBase: "#195f5b",
    environment: { light: 0xffdca1, contour: 0xb7a68b, lightX: .22, lightY: .17, strength: .32 },
  },
{
    material: "matte", id: "moonlit", title: "夜石", description: "蓝灰石面与微弱月光，克制、沉静。",
    colors: { primary: 0x8ac9c2, warm: 0xd4a66b, road: 0x526575, edge: 0x70818b, seam: 0x344754, mark: 0xd1d8d9, past: 0x2c3b48, stage: 0x172431, error: 0xffaaa0, onPrimary: 0x152e30 },
    text: "#e5ebeb", muted: "#a6b6c0", success: "#a2cfb1", buttonBase: "#507f7d",
    environment: { light: 0x809fb7, contour: 0x65839b, lightX: .78, lightY: .12, strength: .2 },
  },
{
    material: "pixel", pixelEnvironment: { dimOpacity: .22, posters: [{ x: 121, y: 32, width: 56, height: 24 }, { x: 193, y: 36, width: 54, height: 24 }], image: images["environment"].url, cropX: .75 }, id: "pixel-night", roadMaterial: { geometry: "plain", palette: { shadow: 0x262d33, face: 0x46535b, edge: 0x7d8c90, mark: 0xf1e6c8 }, joint: 0x262d33, landing: 0xf1e6c8, finishMark: 0xf1e6c8, signPlate: false }, title: "像素 · 排练室", description: "高窗、木地板与一台节拍器。",
    stage: 0x3a423f,

  }
];
export const DEFAULT_ORBIT_THEME = "pixel-night";
