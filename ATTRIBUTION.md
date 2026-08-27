# Attribution

`inkling` 复用了以下上游项目的渲染 DNA（wipe 动效、风格配方、生图管线模式），按其 MIT 协议要求署名：

## story-to-handdrawn-video

- 仓库：https://github.com/gnipbao/story-to-handdrawn-video
- 协议：MIT，Copyright (c) 2026 gnipbao
- 复用内容：`文字 → 黑白 → 彩色` 左到右揭示动效（`revealProgress` / `LayerWipe` 渲染原语）、风格库/别名解析模式、生图集成（codex/api 双路径）、storyboard 校验风格、Agent Skill 包结构
- 直接 vendor 的文件（逐字复制，未修改）：`src/easing.ts`、`src/LayerWipe.tsx`——两者对应的 1080×1440 画幅坐标与 inkling 完全一致，无需改写

## MaShanZheng（手写字体）

- 来源：Google Fonts / https://github.com/googlefonts/mashanzheng
- 协议：SIL Open Font License 1.1，Copyright 2018 The Ma Shan Zheng Project Authors
- 用途：Hook/Punchline 手写体文字（`public/fonts/MaShanZheng-Regular.ttf`），随上游项目一并 vendor；原始 OFL 许可证见 `public/fonts/OFL-MaShanZheng.txt`

## hand-drawn-styles（风格库素材来源）

- 仓库：https://github.com/threerocks/hand-drawn-styles
- 协议：MIT，Copyright (c) 2026 liulei
- 复用内容：手绘风格配方（`colored-pencil-diary`、`naive-marker-notes`、`emotional-watercolor-sketch`、`ms-paint-bad-doodle`、`whiteboard-explainer`、`bean-doodle-infographic` 等）经上游项目改编后的风格定义
- 已 vendor 至 `styles/style-library.json` + `styles/references/`（6 个风格子集 + `colored-pencil-diary` 的 4 张参考板图与 profile 文本，逐字复制自上游 `references/`）

上述两份协议原文附于本仓库 `LICENSE` 与后续 vendoring 风格资产时一并保留。
