# 游戏音乐音源

音乐关共用 `public/assets/game/shared/audio/` 素材，与训练音色设置独立。文件大小、来源与 SHA256 见 [清单](samples.json)。运行时加载与复用规则见[架构说明](../../../../../docs/ARCHITECTURE.md#声音与试听)。

- `piano-30..96.flac`（每三个半音）：Alexander Holm / Salamander Grand Piano v3，第 9 力度层，原生 F♯1—C7。来源 https://github.com/sfzinstruments/SalamanderGrandPiano ，CC BY 3.0，许可见 [SalamanderGrandPiano-LICENSE.txt](../../../../public/assets/audio/SalamanderGrandPiano-LICENSE.txt)。处理：取前六秒，重采样 44.1 kHz、立体声、24-bit FLAC，末尾 50ms 淡出，无逐音归一化。
- `ep-48..75.flac`（每三个半音）：Surge XT 1.3.4，源码版本 f7b97c682ade0b87da85ca5968b63d5c7c98e68d，Claes 的 Keys/DX EP 出厂预设；力度 75、效果器关闭，持续按键八秒，44.1 kHz 立体声 24-bit FLAC，末尾 50ms 淡出。播放器控制实际释放，不仿真合成器 note-off。仅分发声音输出，不包含合成器程序；输出（包括出厂预设生成的采样）可分发，见 [Surge 官方说明](https://surge-synthesizer.github.io/faq/)。
- `bass-35/36/41/43.flac`：Karoryfer Samples / D. Smolken，Black And Blue Basses 的 Darkblack 常规指弹 mf/rr1；[原库](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses)，固定版本 6e7d674cdb41be7a54dbccb15472401ad01099b9。CC0，见 [许可](../../../../public/assets/game/shared/audio/Basses-LICENSE.txt)。原 WAV 无损转码；音高按实际基频映射，源键位 B2/C3/F3/G3 实际声音为 B1/C2/F2/G2；相邻音就近变调，不引入轮换或释放噪声。
- `kick.flac`、`stick.flac`、`hat.flac`：Versilian Studios / Karoryfer，演奏者 Austin McMahon，Virtuosity Drums mid 麦克风录音。[原库](https://github.com/sfzinstruments/virtuosity_drums)，固定版本 9f04cf9a734527edfbb0a4eee1f674e45bbf71bc。CC0，见 [许可](../../../../public/assets/game/shared/audio/Virtuosity-LICENSE.txt)。原文件分别为 mid_kick_snon_vl2_rr1.flac、mid_snare_crossstick_vl8.flac、mid_hh_closed_vl2_rr1.flac，直接复制，不逐音归一化。

采样许可不代表歌曲版权；谱面来源及改编取舍由各关卡说明维护。音乐制作规则见[游戏音乐制作约定](../../../../../docs/GAME_MUSIC.md)。
