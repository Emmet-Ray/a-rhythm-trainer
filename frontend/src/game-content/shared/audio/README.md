# 游戏音乐音源

所有游戏音乐共用 `public/assets/game/shared/audio/generaluser-gs/GeneralUser-GS.sf2`，与训练音色和节拍器独立。文件大小、来源、SHA256 和随附许可见[清单](soundfonts.json)；常用音色名见 `generalUser.ts`，也可直接指定 bank/program。

音色库为 S. Christian Collins / GeneralUser GS v2.0.3，[原库](https://github.com/mrbumpy409/GeneralUser-GS)固定版本 `684543d5e5efaef08d02be50dcda8d552478fa60`。保留完整原文件，不裁剪、不重新归一化；[原始许可](../../../../public/assets/game/shared/audio/generaluser-gs/LICENSE.txt)随资源发布。

使用 npm 锁定版本的 SpessaSynth 播放，Worklet 随构建从同一依赖包输出，[Apache-2.0 许可](../../../../public/assets/game/shared/audio/generaluser-gs/SpessaSynth-LICENSE.txt)随资源保留。只有开始示范或挑战时加载音色库，加载复用、通道和停止规则见[架构说明](../../../../../docs/ARCHITECTURE.md#声音与试听)。

音色许可不代表歌曲版权；谱面来源及改编取舍由各关卡说明维护。制作规则见[游戏音乐制作约定](../../../../../docs/GAME_MUSIC.md)。
