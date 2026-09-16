# 预设题库（第一阶段：独立静态内容）

`preset-exercises.json` 是预设练习的唯一内容源，不导入前端 JavaScript，也不复制到 `frontend/dist/`。
浏览器在进入或预加载预设页面时请求 `/content/preset-exercises.json`，不逐题请求。
随机练习、自定义练习不依赖这份文件。

## 修改与验证

1. 编辑 JSON：主题和题目的标题、说明、排序、节奏内容都在这里；数组顺序就是展示顺序。
2. 在 `frontend/` 执行 `npm run validate:content`。也可以用 `npm run validate:content -- /绝对路径/待发布.json` 检查候选文件。
3. 打开本地 `/preset`，刷新后检查主题、击拍/听写列表、具体题目的谱面和播放。
4. 内容修改单独提交版本控制，保留可回退的历史。

最外层格式是 `{ "schemaVersion": 1, "topics": [...] }`。`schemaVersion` 表示格式版本，修改题目不需要递增。
每个主题含 `id`、`title`、`description`、`modes`；每组模式含 `mode`、`questions`；
每题含 `id`、`title`、`description`、`exercise`。说明可以为空字符串。

- 题目 ID 全题库唯一，用于 `/preset/题目ID`。改名和调整顺序时不要修改 ID，也不要把旧 ID 分配给不同题目。
- 删除题目后旧链接会显示“题目不存在”，因此删除前应明确接受这个影响。
- 主题 ID 在主题间唯一。ID 只能含小写字母、数字、连字符。
- 支持 `tapping`、`dictation`；`geometry` 仅保留空题目组，尚不支持题目。
- 没有某模式组或题目时展示该模式的空状态；`topics: []` 展示空题库。
- 节奏沿用当前模型：4/4 拍，每题至少一个小节，每小节恰好四拍；支持已有音符、休止符、单附点、八分三连音。
- 新训练模式、拍号或节奏符号需要改程序，不能仅添加 JSON。
- 发布脚本和浏览器使用同一个解析器。错误会指出主题/模式/题目位置以及时值问题。

## 本地开发与构建预览

`npm run dev` 和 `npm run preview` 都直接读取本目录，不需要复制文件。
可通过环境变量 `PRESET_CONTENT_DIR=/绝对路径/内容目录` 指向另一份候选题库；目录中仍使用固定文件名 `preset-exercises.json`。
每次请求从磁盘读取，文件更新不需要重启服务或重新构建。

成功加载后，当前浏览器页面生命周期内使用同一份题库，避免练习中内容变化。
要查看更新请刷新页面；只在站内切换路由不会更新已成功加载的题库。
失败不会缓存成成功结果，可以点击“重新读取题库”。请求超时为 15 秒。

## 正式部署：前端和内容分开发布

首次上线需要同时部署前端和独立题库，并为固定地址配置真实 JSON 响应。
不能让这个地址落入 SPA 的 `index.html` 回退，也不能只上传 `dist/` 就认为题库已上线。

建议目录隔离（路径仅为示例）：

```text
/srv/rhythm/app/                         ← 前端 dist 部署目录
/srv/rhythm/content/preset-exercises.json ← 独立题库
/srv/rhythm/content-history/             ← 历次题库备份
```

Nginx 路由示例（合并到已有站点配置，前端其他路由保持现状）：

```nginx
location = /content/preset-exercises.json {
    alias /srv/rhythm/content/preset-exercises.json;
    default_type application/json;
    add_header Cache-Control "no-cache" always;
}
```

使用其他静态托管/CDN 时也应把该 URL 映射到独立内容资源，设置 `Content-Type: application/json` 和 `Cache-Control: no-cache`。
`no-cache` 允许缓存，但再次使用前必须重新验证；不要配置 `immutable` 或长期强缓存。
浏览器请求同样指定重新验证。若 CDN 存在覆盖规则，发布后需要清除该 URL 的缓存并确认新内容已生效。

单独更新题库的流程：

1. 本地校验候选 JSON，通过后上传为内容目录中的临时文件。
2. 备份线上旧文件到历史目录，记录版本/提交号。
3. 在同一文件系统内通过原子重命名替换正式文件，不直接边写边提供给浏览器。
4. 检查线上 URL 返回 200、JSON 类型和缓存头；刷新预设列表并进入修改过的题目验证。
5. 若发现问题，用同样的原子替换方式恢复备份；已有页面刷新后读取恢复版本。

前端部署脚本只更新 `app/`，不得对共同父目录执行 `rsync --delete` 等会删除内容的同步操作。
内容目录不在 `dist/` 中，前端构建/重新上传不会自带一份旧题库覆盖线上内容。
这一阶段没有后台编辑器、数据库、定时更新或自动发布服务。
