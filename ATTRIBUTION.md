# Attribution

`inkling` 复用了以下上游项目的渲染 DNA（wipe 动效、风格配方、生图管线模式），按其 MIT 协议要求署名：

## story-to-handdrawn-video

- 仓库：https://github.com/gnipbao/story-to-handdrawn-video
- 协议：MIT，Copyright (c) 2026 gnipbao
- 复用内容：`文字 → 黑白 → 彩色` 左到右揭示动效（`revealProgress` / `LayerWipe` 渲染原语）、风格库/别名解析模式、生图集成（codex/api 双路径）、storyboard 校验风格、Agent Skill 包结构

## hand-drawn-styles（风格库素材来源）

- 仓库：https://github.com/threerocks/hand-drawn-styles
- 协议：MIT，Copyright (c) 2026 liulei
- 复用内容：手绘风格配方（`colored-pencil-diary`、`naive-marker-notes`、`emotional-watercolor-sketch`、`ms-paint-bad-doodle`、`whiteboard-explainer`、`bean-doodle-infographic` 等）经上游项目改编后的风格定义

上述两份协议原文附于本仓库 `LICENSE` 与后续 vendoring 风格资产时一并保留。
