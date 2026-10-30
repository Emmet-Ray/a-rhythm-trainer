# 游戏内容制作

## 内置内容与本地曲目包

可发布的核心项目保留 13 个基础节奏关卡、AI 生成的原创曲目《微光》（`glimmer`）及通用游戏功能。基础关卡音乐来源见[游戏音乐](../../../docs/GAME_MUSIC.md)。共用采样和字体随各自来源说明及许可文件保留。

额外曲目放在 `frontend/level-packs/levels/<id>/`，每个目录的 `index.ts` 默认导出一个满足 `GameLevel` 的对象，`id` 必须与目录名一致，且不能与内置关卡重复。目录按名称排序后追加到内置目录；无需修改核心注册表。只加载你信任的本地代码。

本地关卡仍使用同一套类型、轨道、音频和渲染引擎。谱面、背景及美术源跟随关卡存放，图片用 Vite 的 `?url` 导入，例如：

```ts
import type { GameLevel } from "../../../src/game/core/GameLevel";
import backgroundUrl from "./assets/background.png?url";

// 在图片声明、主题和时间线中复用 backgroundUrl。
// 按 GameLevel 契约定义完整的关卡内容，再 export default level。
```

图片声明的 `source` 使用相对仓库根的本地路径，例如 `frontend/level-packs/levels/<id>/art/background.px.js`。不要把本地图片复制到 `frontend/public/`：该目录会随公开构建发布。Vite 会为实际导入的本地图片处理开发 URL 和构建产物，不需要另建资源服务器。

`catalog.ts` 默认导入空的 `localLevels.ts`；启用本地内容时，Vite 的精确 alias 将它替换为使用 `import.meta.glob` 的发现模块。开发与普通构建默认启用；显式公开模式不导入发现模块或本地曲目。内置关卡列表和共享素材仍由 catalog 统一组装；本地包不能改写引擎规则。

`frontend/level-packs/` 被 Git 忽略，但会自动参与本地及 Docker 构建，必须单独备份；仅推送核心仓库不会备份这些文件。推荐将该目录独立备份或在其中维护单独的私有仓库。不要强制添加被忽略的内容，也不要把包含旧曲目的完整历史合并到公开开发线。

日常开发、公开模式、构建及验证命令见[前端运行说明](../../README.md#本地曲目与公开构建)。公共核心从筛选后的历史继续开发，不再维护一套需要逐次复制的公开代码。旧完整分支仅作为本地迁移备份。

一个关卡的修改从 `levels/<id>/index.ts` 开始：基本信息、路线、主题、资源声明及可选的视觉时间线都在入口中，以局部变量组织，最终导出关卡定义。较长的音乐谱面独立放在 `score.ts`，可编辑美术源放 `art/`，独有的来源和改编说明放 README。简单关卡可以只有入口，不要求每关具有相同文件结构。只有内容复杂到妨碍阅读或需要独立维护时才进一步拆分，不按配置类别机械建文件。只改某关内容通常无需修改通用渲染器或音频引擎。

- `levels/` 拥有独立关卡；关卡之间不直接导入。
- `shared/` 只拥有面向所有关卡的基础内容：默认主题、统一双球模板和公共音色库。双球定制边界见下文公共素材。少数关卡恰好相同的谱面、路线、主题或专属背景允许在各关独立保存，不因重复而提取到 shared。音源许可见[音源说明](shared/audio/README.md)。
- `../game/catalog.ts` 是注册和组装入口，收集关卡、主题、图像及音色库清单；共享 `assets.ts` 同时声明发布图片与默认视觉资源组合；`../game/ui/` 从 catalog 获取内容并注入引擎。引擎不了解具体歌曲 ID。
- `public/assets/game/levels/<id>/` 存放专属发布资源，`public/assets/game/shared/` 存放共用资源；这里的路径相对于 frontend。可编辑源留在内容目录，运行时只加载导出成品。

新增关卡时创建内容目录，入口满足 `GameLevel`，再在 catalog 注册。修改现有关卡时从入口寻找拥有者，避免在全局表重复保存配色、路径或谱面。视觉时间线属于关卡，场景使用原谱从 0 开始的小节编号，`cropX`、`cropY` 从 0（左／上）到 1（右／下），省略纵向位置时顶对齐。

路线修改应同时检查节奏单元的入口、出口及旋转状态，并接回完整地图验证；局部合法不代表全图不交叉。可读性需结合实际跟随与敲击判断，不以减少反转次数作为优化目标。

## 公共素材

像素双球由 `shared/ballTemplate.ts` 统一定义造型与青绿／暖金身份色，无需导出图片。像素主题仅可通过 `ballAppearance.outline` 覆盖轮廓色；所有像素关卡共用轨道提示、拖尾与命中反馈；`ballDecoration` 仅允许湿路闪光装饰，不改变落点规则。哑光主题使用自己的绘法。显示与缓存实现归 `game/rendering/OrbitBalls.ts`。

`shared/art/practice-room.px.js` 提供基础节奏关卡共用的像素排练室，高窗与木地板框出中央安静墙面，节拍器位于手机安全取景区。背景资源统一在 `shared/assets.ts` 声明，道路和取景由 `shared/themes.ts` 维护；保留默认主题 ID 以兼容已有引用。曲目使用各自专属场景。

关卡 README 只记录本关独有的来源、改编取舍、构图理由和限制，不重复目录结构、通用规则或可从配置计算的数量。

像素主题只声明场景背景、取景和压暗、`stage` 场景底色、`roadMaterial` 及受限的球体美术适配。道路色阶唯一维护在 `roadMaterial.palette`；无纹理道路显式使用 `plain` 材质。公共界面配色、已走及范围外道路淡化、落点高亮和结束反馈由渲染层统一维护，关卡不得覆盖；不要复制旧的 `colors`、`roadPalette`、`pastRoadAlpha` 或 `ballFeedback` 配置。内容校验会拒绝这些旧字段。

## 美术源与导出

每份图像只有一处资源声明：专属图像在本关 `index.ts`，公共图像在 `shared/assets.ts`。声明记录发布 URL、尺寸、源文件、pxl 输出位置及 scale；主题和时间线引用同一声明的 URL，校验脚本通过 catalog 读取清单，不依赖关卡内部的文件拆分。

重建使用声明中的 `source` 和 `scale`，在仓库根执行（需要 Node 22.18+ 及本地 pxl skill）：

```sh
node .agents/skills/pxl-pixel-art/bin/pxl.js build <source> --out /tmp/game-art-preview --scale <scale>
```

检查 `/tmp/game-art-preview/<output>` 后复制到 `frontend/public<url>`。单纯目录重构无需重生成已经验收的 PNG。游戏没有运行时 pxl 依赖。画面变化需检查桌面、宽屏取景和道路对比，手机检查按任务需要进行；音频变化还需试听，制作规则见[游戏音乐](../../../docs/GAME_MUSIC.md)。

## 验证

在 `frontend/` 运行 `npm run validate:game`。它双向核对全部已声明和已发布的 PNG/SF2、图像尺寸与源文件、音色库大小、文件头、许可与校验和、主题引用、关卡注册、谱面目标和时间线边界。音色库清单 `shared/audio/soundfonts.json` 核对谱面引用与发布文件；音符与音色都由 `MultipartScore.parts` 声明，`hits` 独立引用可击拍的音符组。

`npm run validate:architecture` 限制引擎到内容库的反向依赖及关卡间导入；`npm test` 覆盖规则与各关内容。完整验证与隔离浏览器回归要求见[前端 README](../../README.md)。

### 基础节奏编配

基础关卡以 `category: "rhythm"` 归类，是否有 `music` 不决定目录分组。每关在自己的 `index.ts` 维护逐小节音高，节奏与时值由原练习推导；`shared/practiceMusic.ts` 统一主题信息、和声与伴奏。钢琴起音与击打目标一一对应，每两拍的轻量电钢琴和贝斯提供支撑，不添加鼓点或额外反拍。

均匀四分、四分与二平均混合及综合挑战使用《小星星》传统主题；其余基础关卡使用《欢乐颂》的节奏变奏。保留熟悉的音高顺序，以重复音拆分长音来适配细分节奏；附点、切分与三连音版本是练习改编，并非原曲节奏的逐音复刻。《欢乐颂》短版本采用收束句并重复末音，保持各关原有目标数量。和声采用低音加开放五度，按半小节随乐句变化，不再套用原先的七和弦即兴进行。

旋律参考：[《Ah ! vous dirai-je, maman》传统谱例](https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Ah_%21_vous_dirai-je%2C_maman)、[Mutopia《Ode to Joy》](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode-a4.pdf)。仅参考旋律，项目自行编排与采样播放，没有引入这些来源的录音。

基础关卡海报从 `exercise` 提取完整单拍节奏：单项显示一拍及两拍重复，混合显示两种单拍，综合从不超过八个音符的小节中选择互补谱例。背景只保留纸面，主题声明纸面坐标，工作区连接谱例与主题，背景渲染器在初始化时绘制谱例并随背景统一裁切、缩放与暗化；不随播放逐拍闪烁。
