import type { PixelBallTemplate } from "../../game/rendering/OrbitBalls";

/** 已验收的 14×14 宝石切面。O 轮廓、S 阴影、B 主体、L 亮面、H 高光、C 冷反光；点为透明。
 * 造型与身份色只有这一份，关卡只能覆盖轮廓色。
 */
export const ballTemplate = {
  rows: [
    "....OOOOOO....",
    "...OOLLLBOO...",
    "..OBLLLLLBBO..",
    ".OBLHHLLLLBBO.",
    "OOLLLLLLLLBBOO",
    "OLLLLLLBBBBBBO",
    "OBLLLBBBBBBBBO",
    "OBBBBBBBBBBSBO",
    "OSBBBBBBBBSSBO",
    "OOSBBBBBBSSCOO",
    ".OSSBBBBSSSSO.",
    "..OSSBBSSSSO..",
    "...OOSSSSOO...",
    "....OOOOOO...."
  ],
  outline: 0x14232a,
  primary: { S: 0x326867, B: 0x58a69a, L: 0x9cd9bd, H: 0xdcebc8, C: 0x81929d },
  warm: { S: 0x815435, B: 0xbb874d, L: 0xe4b877, H: 0xf1dfae, C: 0x81929d },
} as const satisfies PixelBallTemplate;
