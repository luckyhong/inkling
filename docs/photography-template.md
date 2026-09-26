# 摄影编辑流水线（Photography Compilation）

## 概述

「摄影编辑」模板是专为街头摄影、拍立得赠送等场景设计的自动化剪辑流水线。输入用户自有或已授权的拍摄素材片段、照片和配乐，自动生成节奏紧凑、情绪饱满的 1080×1920 竖屏短视频。

**核心特性：**
- 多段式叙事（3-5 个独立小故事）
- 音乐节拍自动检测与卡点剪辑
- 智能变速（行走加速 + 平滑回落）
- 色彩分级（暖色调素材 + 冷色调照片）
- 字幕自动烧录（歌词或语音字幕）
- 多尺寸封面生成（9:16 + 3:4 小红书）

---

## 快速开始

### 前置依赖

```bash
# Node.js 20+ 和 npm
node --version  # >= 20.0.0

# ffmpeg 和 ffprobe（需支持 libx264, aac, loudnorm 滤镜）
ffmpeg -version
ffprobe -version

# Python 3.8+
python3 --version
```

### 安装

```bash
cd inkling
npm install
```

### 运行示例

```bash
# 1. 规划阶段：分析素材，检测节拍，生成剪辑方案
python3 scripts/run_photography.py --mode plan --input examples/photography-01.yaml

# 查看生成的剪辑方案
cat photography-board.json

# 2. 完整渲染：执行剪辑 + 封面 + 标题生成
python3 scripts/run_photography.py --mode full --input examples/photography-01.yaml

# 输出目录：out/photography/<title>/
#   - video.mp4         最终成片（1080x1920）
#   - cover-9x16.png    竖屏封面
#   - cover-3x4.png     小红书封面
#   - meta.json         标题候选和元数据
```

---

## 配置文件结构（photography-script.yaml）

```yaml
schema_version: "1.0"
template: photography
title: street-polaroid-memories  # 项目标识符（URL-safe）

# 3-5 个片段：第一段完整流程（~35-40s），后续段落浓缩版（~17-23s）
segments:
  - clip_path: path/to/segment_01.mp4  # 素材片段路径
    in_point_sec: 0                    # 入点（秒，可选）
    out_point_sec: 40                  # 出点（秒，可选）
    still_photo_path: path/to/photo_01.jpg  # 静态照片（可选）
    reveal_time_sec: 8.5               # LCD 显示照片的时刻（秒，可选）
    walk_start_sec: 22                 # 行走开始时刻（秒，可选）
    walk_end_sec: 30                   # 递交照片时刻（秒，可选）
    reaction_start_sec: 32             # 反应开始时刻（秒，可选）

  - clip_path: path/to/segment_02.mp4
    # ... 后续片段配置 ...

# 已授权背景音乐
bgm_path: path/to/bgm.mp3
bgm_bpm: 120  # 可选：BPM 值用于节拍检测备选方案

# 可选字幕文件（SRT 或 LRC 格式）
subtitle_path: path/to/lyrics.srt  # 可选
subtitle_type: lyric  # 'lyric'（歌词）或 'speech'（语音字幕）

# 可选素材来源标注
source_credit: "素材来源 @创作者ID"  # 可选
```

### 字段说明

#### segments（片段列表）

每个片段代表一个完整的「拍摄 → 揭示 → 递交 → 反应」小故事。

- **clip_path**（必填）：素材视频文件路径（支持 mp4, mov, avi 等 ffmpeg 可读格式）
- **in_point_sec / out_point_sec**（可选）：素材的入点和出点，单位秒。未指定时使用整个素材
- **still_photo_path**（可选）：静态照片路径（jpg, png）。若提供，会在 reveal_time_sec 时刻叠加显示并应用 Ken Burns 缓动
- **reveal_time_sec**（可选）：相机 LCD 显示照片的时刻（相对于该片段素材时间轴）。用于触发暗闪转场或照片叠加
- **walk_start_sec / walk_end_sec**（可选）：行走递交照片的时间窗口。这段时间会自动加速（默认 2.5 倍速），并在递交时刻平滑回落到 1 倍速
- **reaction_start_sec**（可选）：被摄者反应开始的时刻。此后切换为慢镜头长镜头（3-7 秒单镜头保持）

#### bgm_path（必填）

已授权的背景音乐文件路径。流水线会：
1. 自动检测节拍点（使用 ffmpeg 的 silencedetect + astats 作为 onset detection 代理）
2. 备选方案：若检测失败，使用 `bgm_bpm` 参数或默认 120 BPM 生成固定节拍
3. 音量归一化至 `-9 LUFS`（loudnorm 滤镜）

#### subtitle_path / subtitle_type（可选）

- **subtitle_path**：字幕文件路径（SRT 或 LRC 格式）
  - SRT：标准 SubRip 字幕
  - LRC：歌词文件（`[mm:ss.xx]文本` 格式），会自动转换为 SRT
- **subtitle_type**：
  - `lyric`：歌词字幕，全程显示
  - `speech`：语音字幕，仅在有语音的片段显示

字幕样式：黄色粗体无衬线字体（Noto Sans CJK SC Bold），黑色描边，位于画面下方偏中（MarginV=120）

#### source_credit（可选）

素材来源标注文本（如 `"素材来源 @街头摄影师小王"`）。会以半透明叠加方式显示在视频右下角。

**重要声明：** 此流水线 **不支持** 也 **不实现** 任何水印移除、修补或裁切隐藏创作者标识的功能。用户必须使用自有或已获授权的素材。

---

## 剪辑规则详解

以下规则编码为 `templates/photography.json` 中的可配置参数，基于两个参考视频总结而成：

### 1. 段落时长分配

- **第一段**：35-40 秒（完整流程：发现被摄者 → 举起相机 → LCD 揭示 → 打印 → 行走递交 → 反应）
- **后续段**：17-23 秒（浓缩版，保留关键时刻）
- 配置参数：
  - `first_segment_duration_sec`: 37（默认目标时长）
  - `later_segment_duration_sec`: 20（默认目标时长）

### 2. 开头钩子（Hook）

**规则**：最佳视觉高潮（最终照片或揭示画面）必须在前 3 秒内出现，无片头。

**实现**：流水线会检查所有 `reveal_time_sec` 标记，将最具视觉冲击力的片段优先排在前 3 秒。

配置参数：
- `hook_window_sec`: 3

### 3. 节奏与卡点

- **前半段**（0-50% 时长）：快速切镜，每个镜头 1-1.5 秒，严格落在音乐节拍点上
- **前 15 秒**：超密集剪辑，镜头可短至 0.5 秒
- **后半段**（50-100% 时长）：慢镜头长镜头，每个镜头 3-7 秒，保持情绪

配置参数：
- `fast_cut_duration_sec`: 1.25（常规快切时长）
- `hook_cut_duration_sec`: 0.75（前 15 秒超快切）
- `slow_cut_duration_sec`: 5.0（后半段慢切）

**节拍检测**：
- 主方案：使用 ffmpeg 的 `silencedetect` + `astats` 滤镜检测音频峰值作为节拍标记
- 备选方案：若检测到的节拍少于 4 个，使用配置中的 `bgm_bpm` 或默认 `default_bpm: 120` 生成固定节拍网格

### 4. 变速（Speed Ramping）

**行走递交片段**：
- 行走部分加速至 2-3 倍速（配置为 `walk_speed_multiplier: 2.5`）
- 在递交时刻（`walk_end_sec`）平滑回落到 1 倍速
- 实现：`setpts=PTS/2.5` ffmpeg 滤镜

### 5. 转场（Transitions）

- **段内转场**：硬切（无过渡）
- **照片揭示前**：可选 1-2 帧暗闪（`transition_dark_flash_frames: 2`）
- **段间转场**：
  - 硬切（默认）
  - 或合成动态模糊扫光转场（`transition_whip_duration_sec: 0.3`，未在当前版本实现，预留接口）

### 6. 色彩分级

**素材视频**：
- 暖色调偏移（`color_warm_shift: 15`，ffmpeg `eq` 滤镜的 `temperature` 参数）
- 高饱和度（`color_saturation: 1.3`）
- 滤镜链：`eq=saturation=1.3:temperature=15`

**静态照片**：
- 高对比度（`photo_contrast: 1.2`）
- 锐化（未实现，可扩展 `unsharp` 滤镜）
- 阴影稍冷（未实现，可扩展 `curves` LUT）

**裁切策略**：
- 横向 3:2 照片裁切填充 9:16 画幅（`crop=1080:1920`），无黑边，无模糊填充
- 可选 Ken Burns 缓动（放大 + 平移，未在当前版本实现，预留接口）

### 7. 字幕

**样式**：
- 字体：Noto Sans CJK SC Bold（粗体无衬线，支持中日韩）
- 颜色：黄色（`PrimaryColour=&H00FFFF`）
- 描边：黑色 2px（`OutlineColour=&H000000,Outline=2`）
- 位置：下方偏中（`MarginV=120`）

**时间轴**：
- 歌词字幕（`lyric`）：从 SRT/LRC 文件解析，全程同步
- 语音字幕（`speech`）：仅在有语音的片段启用（需外部语音识别生成 SRT，流水线不内置 ASR）

### 8. 音频

**BGM**：
- 归一化至 `-9 LUFS`（`bgm_target_lufs: -9`）
- 使用 ffmpeg `loudnorm` 两步处理：
  1. 第一遍：分析响度参数
  2. 第二遍：应用归一化

**环境音**：
- 默认静音（素材中的环境音被 BGM 完全替代）
- 可选保留原声窗口（未在当前版本实现，预留 `keep_original_voice_windows` 配置接口）

**可选音效**：
- 快门音效（SFX）：在关键切点（如 reveal_time_sec）叠加合成快门声
- 当前版本未实现，可复用 `scripts/generate-sfx.mjs` 生成免版权音效

### 9. 结尾

- **硬切收尾**：不淡出，不加片尾字幕卡（CTA），直接在最后反应镜头结束时硬切，方便无限循环
- **音乐裁切**：允许音乐在句中截断（不强制对齐乐句结尾）

### 10. 素材来源标注

若配置了 `source_credit`，会在视频右下角以半透明文字叠加显示（如 `"素材来源 @xxx"`）。

---

## 输出物

### 1. video.mp4

- **分辨率**：1080×1920（9:16 竖屏）
- **帧率**：30 fps
- **编码**：H.264 (libx264), CRF 18, yuv420p
- **音频**：AAC 192kbps

### 2. 封面图片

- **cover-9x16.png**：1080×1920 竖屏封面（抖音、快手、视频号）
- **cover-3x4.png**：1080×1440 封面（小红书）

**提取时间点**：视频总时长的 1/3 处（通常是第一段的揭示高潮）

### 3. meta.json

```json
{
  "schema_version": "1.0",
  "title_candidates": [
    "记录美好瞬间",
    "街头摄影故事",
    "用镜头定格时光"
  ],
  "hashtags": ["街头摄影", "拍立得", "记录生活", "人像摄影", "温暖瞬间"],
  "template": "photography",
  "duration_sec": 60.5,
  "segment_count": 3,
  "source_credit": "素材来源 @xxx",
  "bgm_path": "path/to/bgm.mp3",
  "performance": {
    "published": false,
    ...
  }
}
```

---

## 参数调优

所有剪辑规则的默认值都在 `templates/photography.json` 中定义，可根据实际需求调整：

```json
{
  "template": "photography",
  "first_segment_duration_sec": 37,      // 第一段目标时长
  "later_segment_duration_sec": 20,      // 后续段目标时长
  "hook_window_sec": 3,                  // 钩子窗口（必须在前 3 秒出现高潮）
  "fast_cut_duration_sec": 1.25,         // 快切镜头时长
  "hook_cut_duration_sec": 0.75,         // 前 15 秒超快切时长
  "slow_cut_duration_sec": 5.0,          // 后半段慢切时长
  "walk_speed_multiplier": 2.5,          // 行走加速倍率
  "default_bpm": 120,                    // 默认节拍 BPM（节拍检测失败时使用）
  "color_warm_shift": 15,                // 暖色调偏移值
  "color_saturation": 1.3,               // 饱和度倍率
  "photo_contrast": 1.2,                 // 照片对比度倍率
  "bgm_target_lufs": -9,                 // BGM 目标响度
  "transition_dark_flash_frames": 2,     // 暗闪转场帧数
  "transition_whip_duration_sec": 0.3    // 扫光转场时长（预留）
}
```

---

## 测试与验证

### 合成测试素材

使用 ffmpeg 生成合成测试片段和配乐：

```bash
# 1. 生成 3 个测试片段（彩色噪声 + 文字标记）
mkdir -p examples/photography/clips examples/photography/photos examples/photography/bgm

for i in 1 2 3; do
  ffmpeg -f lavfi -i testsrc=duration=40:size=1080x1920:rate=30 \
    -vf "drawtext=text='Segment $i':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
    -c:v libx264 -crf 23 -pix_fmt yuv420p \
    examples/photography/clips/segment_0$i.mp4
done

# 2. 生成测试照片（纯色 + 文字）
for i in 1 2 3; do
  ffmpeg -f lavfi -i color=c=blue:s=1080x1920:d=1 \
    -vf "drawtext=text='Photo $i':fontsize=96:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2" \
    -frames:v 1 \
    examples/photography/photos/photo_0$i.jpg
done

# 3. 生成合成节拍轨道（120 BPM，正弦波 + 节拍脉冲）
ffmpeg -f lavfi -i "sine=frequency=440:duration=80" \
  -af "aecho=0.8:0.9:500:0.3,atempo=1.0" \
  examples/photography/bgm/test_beat_track.mp3
```

### 运行测试

```bash
# 使用合成素材运行完整流水线
python3 scripts/run_photography.py --mode full --input examples/photography-01.yaml

# 检查输出
ls -lh out/photography/street-polaroid-memories/
# 应包含：video.mp4, cover-9x16.png, cover-3x4.png, meta.json

# 播放验证
ffplay out/photography/street-polaroid-memories/video.mp4
```

### 自动化测试（预留）

当前版本未包含自动化测试。可扩展为：

```bash
# tests/test_photography.py
def test_photography_pipeline():
    # 1. 使用合成素材运行 plan 模式
    # 2. 验证 photography-board.json 的节拍数量 >= 40
    # 3. 运行 render 模式
    # 4. 验证输出视频的分辨率、帧率、时长
    # 5. 验证封面图片的分辨率
    pass
```

---

## 常见问题

### Q1: 节拍检测不准确怎么办？

**A**: 在配置文件中手动指定 `bgm_bpm` 参数：

```yaml
bgm_path: path/to/bgm.mp3
bgm_bpm: 128  # 手动指定 BPM
```

流水线会优先使用自动检测，若检测结果少于 4 个节拍点，会回退到固定 BPM 网格。

### Q2: 如何调整行走加速的速度？

**A**: 修改 `templates/photography.json` 中的 `walk_speed_multiplier` 参数：

```json
{
  "walk_speed_multiplier": 3.0  // 从 2.5 调整为 3.0 倍速
}
```

### Q3: 字幕乱码怎么办？

**A**: 确保字幕文件编码为 UTF-8，且系统已安装 Noto Sans CJK SC 字体：

```bash
# Ubuntu/Debian
sudo apt install fonts-noto-cjk

# macOS
brew tap homebrew/cask-fonts
brew install --cask font-noto-sans-cjk-sc
```

### Q4: ffmpeg 报错 "Unknown encoder 'libx264'"

**A**: ffmpeg 未包含 libx264 编码器，需重新编译或安装完整版本：

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

### Q5: 能否用于商业用途？

**A**: inkling 引擎本身是 MIT 协议开源。但用户必须：
1. 使用自有或已获商业授权的素材（视频片段、照片、音乐）
2. 遵守素材授权协议中的商业使用条款
3. 若使用他人素材，必须在 `source_credit` 字段标注来源

---

## 扩展开发

### 添加新的转场效果

在 `scripts/run_photography.py` 的 `process_segment()` 函数中扩展：

```python
# 添加扫光转场（whip transition）
if segment_index > 0 and config.get("use_whip_transition"):
    # 在前一段末尾添加动态模糊
    filters.append(
        f"[v{i}]boxblur=10:1,setpts=PTS*0.5[whip_out]; "
        f"[v{i+1}]boxblur=10:1,setpts=PTS*0.5[whip_in]; "
        f"[whip_out][whip_in]xfade=transition=wiperight:duration=0.3[v_transition]"
    )
```

### 集成 Ken Burns 效果

为静态照片添加缓动放大 + 平移：

```python
# 在 process_segment() 中处理 still_photo_path
if segment.get("still_photo_path"):
    photo_filter = (
        f"[1:v]scale=2160:3840,"  # 放大 2 倍
        f"zoompan=z='min(zoom+0.0015,1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920"
    )
```

### 添加语音识别字幕生成

集成 Whisper 或其他 ASR 引擎：

```python
import whisper

def generate_speech_subtitles(video_path, output_srt):
    model = whisper.load_model("base")
    result = model.transcribe(video_path, language="zh")
    
    with open(output_srt, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], 1):
            f.write(f"{i}\n")
            f.write(f"{format_srt_time(segment['start'])} --> {format_srt_time(segment['end'])}\n")
            f.write(f"{segment['text'].strip()}\n\n")
```

---

## 许可与贡献

本模板遵循 inkling 项目的 MIT 协议。欢迎提交 Issue 和 Pull Request！

**重要声明**：
1. 本流水线不实现任何水印移除或遮挡功能
2. 用户必须使用自有或已获授权的素材
3. 侵权责任由用户自行承担

---

## 技术栈

- **Node.js**：配置解析、节拍检测脚本
- **Python 3**：流水线编排、ffmpeg 调用
- **ffmpeg/ffprobe**：视频剪辑、色彩分级、音频处理、字幕烧录
- **js-yaml**：YAML 配置解析

---

## 更新日志

### v0.1.0 (2026-09-26)

- ✅ 初始实现：多段式剪辑流水线
- ✅ 节拍检测与卡点剪辑
- ✅ 变速（行走加速）
- ✅ 色彩分级（暖色调 + 高饱和度）
- ✅ 字幕烧录（SRT/LRC 支持）
- ✅ 多尺寸封面生成
- ✅ 标题候选生成
- ⏳ 待实现：Ken Burns 效果
- ⏳ 待实现：扫光转场
- ⏳ 待实现：快门音效叠加

---

**相关文档：**
- [inkling 主文档](../README.md)
- [数据契约规范](../docs/schema.md)
- [配置参数详解](../templates/photography.json)
