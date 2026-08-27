# inkling（纸上瘾）

专门生产「看着一张画长出来」的 15–30 秒竖屏短视频引擎。不是文生视频，是围绕
`hook → 揭示 → punchline` 这一个内容形态做的品类工具——3 个模板（反转 / 金句 /
烂画喜剧），强制节拍合同，程序化音效，角色一致性复用。

开源协议：MIT

---

## 30 秒复现

```bash
npm install
npm run generate:sfx                                  # 合成程序化音效（首次需要）
python3 scripts/run_short.py --mode preview --input examples/twist-01.yaml
```

`out/preview.mp4` 里能看到：Hook 大字浮现 → 黑白线稿左到右揭示 → 彩色揭示 →
Punchline 印章式收尾。这一步不需要任何图像生成 API，用的是仓库自带的占位图。

要产出真正能发布的一条（含真实插画、封面、标题候选、素材包）：

```bash
python3 scripts/run_short.py --mode full --input examples/twist-01.yaml --generator api
# 或（不需要 API key，交给外部 agent 完成生图）：
python3 scripts/run_short.py --mode full --input examples/twist-01.yaml --generator codex
# codex 路径会在写完 prompt/job manifest 后停下，手动生成图片、
# 跑 scripts/import-generated-image.mjs，再执行：
python3 scripts/run_short.py --mode finish
```

产出目录：`out/shorts/<slug>/{video.mp4, video-preview.mp4, cover.png, meta.json}`

## 三个模板

| 模板 | 用途 | 风格 |
| --- | --- | --- |
| **Twist**（反转） | 前半误导，揭示后打脸 | `colored-pencil-diary` / `naive-marker-notes` |
| **Punchline**（金句） | 一句话配强画面，情绪共鸣 | `colored-pencil-diary` / `emotional-watercolor-sketch` |
| **BadDraw**（烂画喜剧） | 荒诞吐槽，反差与转发欲 | 强制 `ms-paint-bad-doodle`，忽略用户指定风格 |

每个模板 2 条示例脚本在 [`examples/`](examples/)。完整字段说明见
[`docs/schema.md`](docs/schema.md)。

## 节拍参数的验证状态

`ratio`（揭示完成落在总时长 70%–85%）与 `BW_FRACTION`（黑白/彩色子阶段分界）
**都是未经真实完播数据验证的初始假设**，来自内容运营经验推算，不是已证明的最优
值。按 PRD 的设计，这些参数要在真实发布、回填 `meta.json.performance` 之后才能
校准——目前还没有任何一条短片经过这个闭环，所以本 README 暂时没有可展示的
Demo 区。这不是遗漏，是诚实：没有数据支撑的"高完播模板"只是一句营销话术。

## 与上游的关系

复用自 [story-to-handdrawn-video](https://github.com/gnipbao/story-to-handdrawn-video)
的渲染原语（`easing.ts`/`LayerWipe.tsx` 逐字 vendor）、风格库/别名解析模式、
Codex Image2 生图集成模式、Agent Skill 包结构。**不复用**其多场景故事管线、
翻页转场、`storyboard.json` schema——inkling 是单场景短片专用的独立 schema，
避免污染故事管线。详见 [`ATTRIBUTION.md`](ATTRIBUTION.md)。

## 项目结构

```text
inkling/
├── src/                    # Remotion：ShortVideo 时间轴 + 各图层组件
├── scripts/                # plan/validate/generate-image/render 等 CLI 脚本
├── templates/              # 三模板的节拍参数（ratio/style_suggestions/style_lock）
├── styles/                 # 风格库子集 + character_lock 参考帧存储
├── examples/               # 每模板 2 条示例 short-script.yaml
├── skill-package/inkling/  # Agent Skill 包
└── out/                    # 渲染产物（gitignored）
```
