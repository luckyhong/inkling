---
name: inkling
description: Generate 15-30s vertical "watch the drawing grow" shorts (纸上瘾/inkling) from a one-line hook, using one of three high-retention templates — Twist (反转), Punchline (金句), BadDraw (烂画喜剧). Use when the user asks to turn a hook/joke/emotional line into a short-form video, asks about the twist/punchline/baddraw templates, or wants a batch of these produced and packaged for publishing.
---

# inkling（纸上瘾）

Use the project's CLI through this Skill's `scripts/run_short.py`. Set
`INKLING_PROJECT` when the project is not the current working directory.
The wrapper must not rely on an author-specific absolute path.

## What this is not

Not a general text-to-video tool, and not the upstream
`story-to-handdrawn-video` project (which does full multi-scene
illustrated stories). This is a single-scene, hard-coded-beat engine for
one content shape: hook → drawing reveal → punchline, tuned for
information-feed completion rate rather than storytelling completeness.

## Workflow

1. Get one hook line (and, for Twist, a `punchline` that recontextualizes
   it, plus optionally a `reveal_visual` that overrides `visual` for the
   reveal). Pick a template:
   - **Twist** (反转): front half misleads, punchline reframes it.
   - **Punchline** (金句): one emotional/observational line, image reinforces it.
   - **BadDraw** (烂画喜剧): absurdist/workplace comedy — style is forced
     to `ms-paint-bad-doodle` regardless of any requested style.
2. Write (or have the agent draft) a `short-script.yaml` — see
   `docs/schema.md` §1 for the exact fields, or copy one of
   `examples/*.yaml` as a starting point.
3. Run `python3 scripts/run_short.py --mode plan --input <script.yaml>`
   first to check the computed beats before spending any image-generation
   budget. `--mode preview` additionally renders a fast low-res MP4 using
   whatever art is currently in `shortboard.json` (placeholder by default).
4. For a real illustration, `--mode full --generator api` runs
   synchronously (requires `OPENAI_API_KEY`; retries then degrades to
   placeholder art rather than shipping a broken asset — check the
   console output for a DEGRADED warning). `--generator codex` (default)
   writes an image prompt + job manifest and stops — fulfill it (generate
   `image-jobs.json`'s `output_master` PNG from its prompt), run
   `node scripts/import-generated-image.mjs`, then re-run with
   `--mode finish`.
5. The finished package lands in `out/shorts/<slug>/`: `video.mp4`,
   `video-preview.mp4`, `cover.png`, `meta.json` (title candidates,
   hashtags, and an empty `performance` scaffold for post-publish data).
6. Report back: template used, resolved style, output directory, and
   whether generation succeeded or degraded to placeholder art.

## Non-negotiable rules (do not let the user talk you out of these)

- **Single scene only.** Never split the input into multiple beats/scenes
  — that's the upstream story project's job, not this one's. Splitting
  defeats the whole point of the beat contract below.
- **Beat contract** (PRD §4.2): hook readable within the first ~1.2s;
  color reveal must complete between 70% and 85% of total duration, never
  earlier or later; the short must end on a punchline or an unresolved
  hook, never a black screen. `scripts/validate-shortboard.mjs` enforces
  this — don't hand-edit a `shortboard.json` to bypass it.
- **BadDraw's style is locked.** If the user requests a different style
  with `--template baddraw`, `plan-short.mjs` forces `ms-paint-bad-doodle`
  and prints a warning — this is intentional (AC3), not a bug to route
  around.
- **The illustration itself must stay text-free.** Hook and punchline are
  separate Remotion text overlays (`HookText`/`PunchlineOverlay`), never
  baked into the generated image — unlike upstream's optional
  `text_mode: image2`.
- **Character consistency**: if `character_lock` is set, the same lock
  text should be reused verbatim across a series so
  `resolve-character.mjs` can find and reuse the saved reference frame
  instead of re-rolling the character's appearance each time.
- **Never claim the beat-timing parameters (ratio=0.70-0.85,
  BW_FRACTION=0.45) are validated.** They're initial assumptions pending
  real publish data (PRD §5) — say so if asked.

## Style library

`styles/style-library.json` is a 6-style vendored subset (not the
upstream project's full 20). `--style` accepts the id, Chinese name,
English name, order number, or any alias — see `scripts/style-library.mjs`.

| # | Style id | 中文名 | Used by |
|---:|---|---|---|
| 1 | `colored-pencil-diary` | 彩铅日记漫画（默认） | Twist, Punchline |
| 2 | `naive-marker-notes` | 稚拙马克笔笔记 | Twist |
| 3 | `emotional-watercolor-sketch` | 情绪叙事淡彩速写 | Punchline |
| 4 | `ms-paint-bad-doodle` | 鼠标烂涂鸦 | BadDraw (locked) |
| 5 | `whiteboard-explainer` | 白板讲解动画 | — |
| 6 | `bean-doodle-infographic` | 小豆人涂鸦信息图 | — |
