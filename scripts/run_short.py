#!/usr/bin/env python3
"""Unified CLI entry for inkling (PRD §9.2 "统一入口").

A thin dispatcher: short-script.yaml parsing and CLI-override logic
already live in plan-short.mjs (Node, where the YAML is loaded) — this
script just orchestrates the pipeline stages in the right order and
shells out to the existing scripts/*.mjs and `remotion render`.

Modes:
  plan     short-script.yaml -> shortboard.json. No image generation,
           no render. (F5)
  preview  plan, then a fast low-res render using whatever assets are
           currently in shortboard.json (placeholder art by default).
  full     plan, then generate a real illustration.
             --generator api (default-capable, synchronous): generates,
               retries on failure, degrades to placeholder on exhaustion
               (F19), then proceeds straight to packaging.
             --generator codex: writes a prompt + job manifest for an
               external agent to fulfill, then STOPS — codex fulfillment
               can't happen inside this one process. Re-run with
               --mode finish once scripts/import-generated-image.mjs
               has been run against the produced master image.
  finish   render full + preview, export cover, generate titles/meta,
           and package everything into out/shorts/<slug>/. Assumes
           shortboard.json's scene.assets already point at the art you
           want in the final package (real or placeholder).
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def node(script, *args):
    subprocess.run(["node", str(ROOT / "scripts" / script), *args], check=True, cwd=ROOT)


def node_capture(script, *args):
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / script), *args],
        check=True, cwd=ROOT, capture_output=True, text=True,
    )
    return result.stdout


def remotion_render(output_path, *, preview):
    # Mirrors package.json's render/render:preview scripts — kept in sync
    # by hand since this needs a caller-chosen output path, not the fixed
    # out/preview.mp4 / out/video.mp4 the npm scripts hardcode.
    args = [
        "npx", "remotion", "render", "src/index.ts", "ShortVideo", str(output_path),
        "--codec=h264", "--pixel-format=yuv420p", "--concurrency=1",
    ]
    if preview:
        args += ["--crf=23", "--scale=0.6666666666666666"]
    else:
        args += ["--crf=18"]
    subprocess.run(args, check=True, cwd=ROOT)


def slug_for_shortboard():
    shortboard = json.loads((ROOT / "shortboard.json").read_text())
    return shortboard["project"]["title"]


def finish_pipeline():
    slug = slug_for_shortboard()
    out_dir = ROOT / "out" / "shorts" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[run_short] rendering full + preview into {out_dir}")
    remotion_render(out_dir / "video.mp4", preview=False)
    remotion_render(out_dir / "video-preview.mp4", preview=True)

    node(
        "export-cover.mjs",
        "--video", str(out_dir / "video.mp4"),
        "--shortboard", str(ROOT / "shortboard.json"),
        "--out", str(out_dir / "cover.png"),
    )

    titles = json.loads(node_capture("generate-titles.mjs", str(ROOT / "shortboard.json")))
    shortboard = json.loads((ROOT / "shortboard.json").read_text())
    project, scene = shortboard["project"], shortboard["scene"]

    meta = {
        "schema_version": shortboard["schema_version"],
        "title_candidates": titles["title_candidates"],
        "hashtags": titles["hashtags"],
        "template": project["template"],
        "duration_sec": project["duration_sec"],
        "style_id": project["style_id"],
        "character_lock": project["character_lock"],
        "hook": scene["hook_text"],
        "punchline": scene["punchline_text"],
        "credit_to": scene["credit_to"],
        "beats": {
            "hook_end_sec": project["beats"]["hook_end_sec"],
            "color_complete_sec": project["beats"]["color_complete_sec"],
        },
        "performance": {
            "published": False,
            "platform": None,
            "published_at": None,
            "views": None,
            "completion_rate_3s": None,
            "completion_rate_full": None,
            "likes": None,
            "comments": None,
            "shares": None,
            "cover_ctr": None,
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")

    print(f"[run_short] done: {out_dir}")
    print(f"  video.mp4, video-preview.mp4, cover.png, meta.json")


def add_override_args(parser):
    parser.add_argument("--template", choices=["twist", "punchline", "baddraw"])
    parser.add_argument("--style")
    parser.add_argument("--duration", choices=["15", "21", "30"])
    parser.add_argument("--character-lock")
    parser.add_argument("--sfx", choices=["on", "off"])
    parser.add_argument("--credit-to")


def overrides_to_args(args):
    mapping = {
        "template": "--template", "style": "--style", "duration": "--duration",
        "character_lock": "--character-lock", "sfx": "--sfx", "credit_to": "--credit-to",
    }
    out = []
    for attr, flag in mapping.items():
        value = getattr(args, attr, None)
        if value is not None:
            out += [flag, value]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["plan", "preview", "full", "finish"], default="plan")
    parser.add_argument("--input", help="short-script.yaml (required for plan/preview/full)")
    parser.add_argument("--generator", choices=["codex", "api"], default="codex")
    parser.add_argument("--max-attempts", default="2")
    add_override_args(parser)
    args = parser.parse_args()

    if args.mode in ("plan", "preview", "full") and not args.input:
        parser.error(f"--mode {args.mode} requires --input")

    if args.mode in ("plan", "preview", "full"):
        node("plan-short.mjs", "--input", args.input, *overrides_to_args(args))

    if args.mode == "plan":
        return

    if args.mode == "preview":
        remotion_render(ROOT / "out" / "preview.mp4", preview=True)
        print(f"[run_short] wrote {ROOT / 'out' / 'preview.mp4'}")
        return

    if args.mode == "full":
        degraded = False
        try:
            node("generate-image.mjs", "--generator", args.generator, "--max-attempts", args.max_attempts)
        except subprocess.CalledProcessError as exc:
            if exc.returncode != 2:
                raise
            degraded = True
            print("[run_short] generation degraded to placeholder art (F19) — packaging anyway.")

        if args.generator == "codex" and not degraded:
            print(
                "[run_short] codex job manifest written. Have an agent fulfill it, run "
                "scripts/import-generated-image.mjs, then re-run with --mode finish."
            )
            return

        if not degraded:
            node("import-generated-image.mjs")
        finish_pipeline()
        return

    if args.mode == "finish":
        finish_pipeline()
        return


if __name__ == "__main__":
    main()
