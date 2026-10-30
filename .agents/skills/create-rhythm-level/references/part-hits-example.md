# 跨声部击拍的最小例子

这是一小节虚构数据，只说明“声部”和“击拍职责”相互独立。按仓库当前 `MultipartScore` 类型编写，导入路径按 `frontend/level-packs/levels/<id>/score.ts` 编写，放进其他目录时调整相对路径。

```ts
import type { MultipartScore } from "../../../src/game/core/MultipartScore.ts";
import { generalUserFile, generalUserPresets } from "../../../src/game-content/shared/audio/generalUser.ts";

export const music: MultipartScore = {
  title: "跨声部示例", recommendedBpm: 100,
  soundFont: { file: generalUserFile, gain: 1 },
  bars: [4], sections: [],
  parts: [
    { id: "upper", name: "钢琴上声部", preset: generalUserPresets.piano, notes: [
      { id: "a", beat: 0, duration: 1, midi: 72, velocity: .5 },
      { id: "b", beat: 1, duration: 1, midi: 74, velocity: .5 },
      { id: "c", beat: 2, duration: 2, midi: 76, velocity: .5 },
    ] },
    { id: "lower", name: "钢琴下声部", preset: generalUserPresets.piano, notes: [
      { id: "bass", beat: 0, duration: 4, midi: 48, velocity: .25 },
      { id: "answer", beat: 2, duration: 1, midi: 55, velocity: .4 },
      { id: "ending", beat: 3, duration: 1, midi: 60, velocity: .45 },
    ] },
  ],
  hits: [
    [{ partId: "upper", noteId: "a" }],
    [{ partId: "upper", noteId: "b" }],
    [{ partId: "upper", noteId: "c" }, { partId: "lower", noteId: "answer" }],
    [{ partId: "lower", noteId: "ending" }],
  ],
};
```

击拍拍位为 `[0, 1, 2, 3]`。拍位 2 的一次击拍同时触发两个声部，并分别按两拍、一拍释放；最后一次由下声部接力。`lower/bass` 未归属任何击拍，挑战中自动演奏。示范演奏六个音符各一次，包含这个自动低音。

两个声部都用钢琴，但保留各自身份；换音色不会改变击拍映射。实际曲目可以有任意适合谱面的声部，示例中的音色、力度和数量不是默认要求。
