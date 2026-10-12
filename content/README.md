# 预设题库编辑与发布

[preset-exercises.json](preset-exercises.json) 是预设题目的唯一内容源，独立于前端构建；随机和自定义题目不依赖它。
格式与校验以 [presetCatalog.ts](../frontend/src/exercises/presetCatalog.ts) 为准。

## 编辑与验证

1. 修改 JSON 中的主题、模式、题目和节奏；数组顺序就是展示顺序。
2. 在 `frontend/` 执行 `npm run validate:content`，或 `npm run validate:content -- /绝对路径/候选.json`。
3. 刷新 `/preset`，检查修改过的主题、谱面与播放，并保留可回退版本。

题目 ID 全库唯一，用于地址和历史身份；改名、排序保持 ID，不把旧 ID 分配给另一题。删除题目会使旧链接失效。
`schemaVersion` 表示格式版本，普通内容修改不递增。增加训练模式、拍号或节奏符号需要同步改程序。

开发和构建预览直接读取本目录；`PRESET_CONTENT_DIR` 可指向候选目录，固定文件名仍为 `preset-exercises.json`。
成功读取的题库在当前页面生命周期内保持稳定，查看更新需刷新；读取失败可明确重试。

## 独立发布

固定地址 `/content/preset-exercises.json` 必须返回真实 JSON，不能落入 SPA 页面回退。只上传 `dist/` 不会发布题库。
Docker 已将本目录只读挂载到 `/srv/content`；路由见 [nginx.conf](../frontend/nginx.conf)。手动托管也要提供独立内容目录：

```nginx
location = /content/preset-exercises.json {
    alias /srv/rhythm/content/preset-exercises.json;
    default_type application/json;
    add_header Cache-Control "no-cache" always;
}
```

单独更新流程：

1. 校验候选文件，上传到内容目录临时文件，备份线上旧文件并记录版本。
2. 在同一文件系统内原子重命名替换正式文件，避免浏览器读到写入一半的 JSON。
3. 检查固定 URL 的状态、JSON 类型和缓存头，刷新页面验证；必要时同样原子替换恢复备份。

`no-cache` 要求使用前重新验证；不要为题库设置 `immutable`。存在 CDN 覆盖规则时确认更新已生效。
前端发布只更新应用目录，避免同步清理操作删除独立内容目录。
