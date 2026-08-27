# 数据契约（schema_version 1.0）

对应 TypeScript 类型定义见 [`src/types.ts`](../src/types.ts)。本文档是给人看的参考，实现以 `types.ts` 为准。

## 1. `short-script.yaml`（创作者输入）

```yaml
schema_version: "1.0"
template: twist          # twist | punchline | baddraw
title: overtime-trap
duration_sec: 21         # optional，模板有默认值
style: colored-pencil-diary
character_lock: "同一青年男性，短发，灰色卫衣"
sfx: on                  # optional，默认 on
credit_to: null          # optional，评论区征集场景填投稿人标注

hook: "他以为加班能换来升职。"
visual: "空荡办公室只剩他一人，工位上贴着离职便签"
punchline: "换来的是：位置都没了。"

# twist 模板可用 reveal_visual 覆盖 visual
# reveal_visual: "..."
```

## 2. `shortboard.json`（`plan-short` 产物，Phase 1 实现）

```json
{
  "schema_version": "1.0",
  "project": {
    "title": "overtime-trap",
    "template": "twist",
    "width": 1080,
    "height": 1440,
    "fps": 30,
    "duration_sec": 21,
    "style_id": "colored-pencil-diary",
    "style_fingerprint": "...",
    "character_lock": "...",
    "character_reference_id": "lock_hash_abc123",
    "sfx": true,
    "beats": {
      "hook_end_sec": 1.2,
      "draw_start_sec": 1.2,
      "color_complete_sec": 16.5,
      "punchline_start_sec": 16.5
    }
  },
  "scene": {
    "id": "01",
    "hook_text": "他以为加班能换来升职。",
    "punchline_text": "换来的是：位置都没了。",
    "visual": "空荡办公室只剩他一人，工位上贴着离职便签",
    "credit_to": null,
    "layers": ["hook_text", "bw_full", "color", "punchline_text"],
    "assets": {
      "bw": null,
      "color": null
    }
  }
}
```

## 3. `meta.json`（发布素材包 sidecar，Phase 2 实现）

```json
{
  "schema_version": "1.0",
  "title_candidates": ["...", "...", "..."],
  "hashtags": ["纸上瘾", "手绘", "..."],
  "template": "twist",
  "duration_sec": 21,
  "style_id": "colored-pencil-diary",
  "character_lock": "同一青年男性，短发，灰色卫衣",
  "hook": "...",
  "punchline": "...",
  "credit_to": null,
  "beats": {
    "hook_end_sec": 1.2,
    "color_complete_sec": 16.5
  },
  "performance": {
    "published": false,
    "platform": null,
    "published_at": null,
    "views": null,
    "completion_rate_3s": null,
    "completion_rate_full": null,
    "likes": null,
    "comments": null,
    "shares": null,
    "cover_ctr": null
  }
}
```

`performance` 字段在渲染时全为空/`false`，发布后由人工回填（见 PRD 第 5 节数据反馈闭环）。

## 4. `styles/characters/<lock_hash>/reference.json`（character_lock 复用，Phase 2 实现）

```json
{
  "lock_hash": "abc123",
  "character_lock_text": "同一青年男性，短发，灰色卫衣",
  "created_at": "2026-08-27T00:00:00Z",
  "reference_frames": [
    { "style_id": "colored-pencil-diary", "frame_path": "styles/characters/abc123/cpd_front.png" }
  ],
  "usage_count": 1
}
```

`lock_hash` 由 `character_lock` 文本哈希得出，用于目录命名与复用命中判断（见 [`ATTRIBUTION.md`](../ATTRIBUTION.md) 中上游 `style_fingerprint` 机制的同构设计）。

## 5. `templates/<name>.json`（节拍参数表，Phase 0 本次交付）

```json
{
  "template": "twist",
  "duration_sec": 21,
  "ratio": 0.78,
  "style_suggestions": ["colored-pencil-diary", "naive-marker-notes"],
  "style_lock": null
}
```

节拍算法（`plan-short` 在 Phase 1 实现时使用）：

```text
hook_end = min(1.2, duration_sec * 0.08)
color_complete = duration_sec * clamp(ratio, 0.70, 0.85)
punchline_start = color_complete
draw_start = hook_end
```

> `ratio` 初始值来自内容运营经验，非已验证最优值，详见 PRD 第 5 节数据反馈闭环设计。
