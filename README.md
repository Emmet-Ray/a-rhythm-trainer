# 节奏训练

## 核心功能

### 总览

一个节奏训练工具，目前支持击拍练习、节奏听写两种模式，支持预设练习、随机练习、自定义练习。

![首页总览：预设练习、随机练习与自定义练习入口](docs/media/overview.png)

### 击拍练习

跟随谱面按空格键击拍，查看每次击拍的准确度与整轮结果。

![击拍练习：预备拍、空格击拍与判定反馈](docs/media/tapping.gif)

### 节奏听写

聆听题目，输入音符与休止符，逐小节验证答案。

![节奏听写：播放题目、输入节奏与验证答案](docs/media/dictation.gif)

_动图仅演示操作，不含声音。_

## 技术栈

- **前端界面**：React、TypeScript、Vite。
- **谱面渲染**：VexFlow。
- **音频与节拍调度**：Web Audio API。
- **后端接口**：Python、FastAPI。
- **数据存储**：SQLite、SQLAlchemy；Alembic 管理数据库迁移。
- **部署**：Docker Compose、Nginx。

## 快速启动（Docker）

```sh
git clone https://github.com/Emmet-Ray/a-rhythm-trainer.git
cd a-rhythm-trainer
docker compose up
```

打开 <http://localhost:8080>访问网页内容

## TODO

- [ ] 调整预设题目
  - 题目内容安排
  - 给预设题目提供不同的view（现在还都是文字）
- [ ] 练习记录
  - [x] 练习记录列表与详情分页，每页 10 条
  - [x] 正式击拍开始后主动停止记为未通过，准备和预备拍阶段停止不记录
  - [ ] 练习记录统计结果、insight
- [ ] 调整随机出题策略
- [ ] 探索 AI / Agent 辅助功能，如出题、节奏讲解与练习建议
  - [ ] 从图片创建练习：探索多模态模型 API（如 DeepSeek、GLM）及本地 Codex 认证接入的可行性
  - [ ] AI 助手分析反复出错的原因，识别不稳定的节奏型，并推荐巩固练习
  - [ ] 根据题目难度感受，推荐更简单或更难的题目
- [ ] 几何节奏游戏模式
- [ ] 更一致统一的UI/UX
- [ ] 自定义练习题目：支持文件导入
- [ ] 支持更多拍号与节奏记谱方式
- [ ] 增加音色选择、节拍器音量与重音设置
- [ ] 支持输入与音频输出延迟校准
