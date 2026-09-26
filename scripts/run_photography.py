#!/usr/bin/env python3
"""Photography compilation pipeline entry point.

Workflow:
  1. plan: photography-script.yaml -> photography-board.json (beat detection, segment planning)
  2. render: ffmpeg-based editing pipeline (cuts, speed ramps, color grading, subtitles)
  3. cover: extract cover frames (9:16 and optionally 3:4)
  4. titles: generate title candidates

Input structure:
  - photography-script.yaml: config with segments, BGM, optional subtitles
  - Segment clips: user's own or licensed footage
  - Optional still photos per segment
  - BGM file (licensed)
  - Optional subtitle file (SRT/LRC)

Output:
  - out/photography/<slug>/video.mp4: 1080x1920 final cut
  - out/photography/<slug>/cover-9x16.png: vertical cover
  - out/photography/<slug>/cover-3x4.png: Xiaohongshu cover (if applicable)
  - out/photography/<slug>/meta.json: titles and metadata
"""

import argparse
import json
import subprocess
import sys
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def node(script, *args):
    subprocess.run(["node", str(ROOT / "scripts" / script), *args], check=True, cwd=ROOT)


def plan_pipeline(input_path):
    """Phase 1: Beat detection and segment planning."""
    print("[run_photography] Planning segments and detecting beats...")
    node("plan-photography.mjs", "--input", str(input_path))


def render_pipeline(board_path, output_dir):
    """Phase 2: Multi-segment editing with ffmpeg."""
    print("[run_photography] Rendering video...")
    
    board = json.loads(board_path.read_text())
    project = board["project"]
    config = board["config"]
    segments = project["beats"]["segments"]
    
    output_dir.mkdir(parents=True, exist_ok=True)
    segment_clips = []
    
    # Process each segment
    for i, segment in enumerate(segments):
        seg_output = output_dir / f"segment_{i:02d}.mp4"
        process_segment(segment, config, seg_output, project["width"], project["height"], project["fps"])
        segment_clips.append(seg_output)
    
    # Concatenate segments
    concat_file = output_dir / "concat.txt"
    with open(concat_file, "w") as f:
        for clip in segment_clips:
            f.write(f"file '{clip.absolute()}'\n")
    
    temp_video = output_dir / "video_no_audio.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-c", "copy", str(temp_video)
    ], check=True)
    
    # Add BGM and normalize audio
    final_video = output_dir / "video.mp4"
    add_audio_track(temp_video, project["bgm_path"], final_video, 
                   project["duration_sec"], config["bgm_target_lufs"])
    
    # Add subtitles if present
    if project["subtitle_path"]:
        add_subtitles(final_video, project["subtitle_path"], 
                     project["subtitle_type"], output_dir / "video_with_subs.mp4")
        final_video.unlink()
        (output_dir / "video_with_subs.mp4").rename(final_video)
    
    # Cleanup temp files
    temp_video.unlink(missing_ok=True)
    concat_file.unlink(missing_ok=True)
    for clip in segment_clips:
        clip.unlink(missing_ok=True)
    
    print(f"[run_photography] Video rendered: {final_video}")


def process_segment(segment, config, output_path, width, height, fps):
    """Process a single segment with cuts, speed ramps, and color grading."""
    clip_path = segment["clip_path"]
    cuts = segment["cuts"]
    
    # Build filter_complex for this segment
    filters = []
    
    for i, cut in enumerate(cuts):
        # Apply speed if needed (for walk sections)
        speed = 1.0
        if segment.get("walk_speed_multiplier", 1.0) > 1.0:
            # Check if this cut is in the walk window
            cut_start = cut["start_sec"]
            walk_start = segment.get("walk_start_sec")
            walk_end = segment.get("walk_end_sec")
            
            if walk_start is not None and walk_end is not None:
                # Map cut_start (segment time) to original clip time
                cut_clip_time = cut["clip_time_sec"]
                # Simple check: if this cut overlaps with walk window
                if walk_start <= cut_start < walk_end:
                    speed = segment["walk_speed_multiplier"]
        
        # Build filter chain for this cut
        # 1. Trim and reset PTS
        cut_filter = f"[0:v]trim=start={cut['clip_time_sec']}:duration={cut['duration_sec']},setpts=PTS-STARTPTS"
        
        # 2. Apply speed adjustment
        if speed != 1.0:
            cut_filter += f",setpts=PTS/{speed}"
        
        # 3. Color grading: saturation and warm tone
        cut_filter += f",eq=saturation={config['color_saturation']}"
        
        # 4. Scale and crop to 9:16 (crop to fill, no letterboxing)
        cut_filter += f",scale=iw*max({width}/iw\\,{height}/ih):ih*max({width}/iw\\,{height}/ih),crop={width}:{height}"
        
        cut_filter += f"[v{i}]"
        filters.append(cut_filter)
    
    # Concatenate all cuts
    concat_inputs = "".join([f"[v{i}]" for i in range(len(cuts))])
    filters.append(f"{concat_inputs}concat=n={len(cuts)}:v=1:a=0[outv]")
    
    filter_complex = ";".join(filters)
    
    # Render segment
    subprocess.run([
        "ffmpeg", "-y", "-i", clip_path,
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-r", str(fps),
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        str(output_path)
    ], check=True, stderr=subprocess.PIPE)


def add_audio_track(video_path, bgm_path, output_path, duration_sec, target_lufs):
    """Add BGM and normalize audio levels."""
    # Apply loudnorm and mix with video
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path), "-i", str(bgm_path),
        "-t", str(duration_sec),
        "-filter_complex", f"[1:a]loudnorm=I={target_lufs}:TP=-1.5:LRA=11[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(output_path)
    ], check=True, stderr=subprocess.PIPE)


def add_subtitles(video_path, subtitle_path, subtitle_type, output_path):
    """Burn in subtitles with yellow bold style."""
    # Detect subtitle format and convert if needed
    subtitle_ext = Path(subtitle_path).suffix.lower()
    
    if subtitle_ext == ".lrc":
        # Convert LRC to SRT
        srt_path = video_path.parent / "subtitles.srt"
        convert_lrc_to_srt(subtitle_path, srt_path)
        subtitle_path = srt_path
    
    # Build subtitle style: yellow bold sans-serif, black outline, lower-middle position
    subtitle_style = "FontName=Noto Sans CJK SC Bold,FontSize=24,PrimaryColour=&H00FFFF,OutlineColour=&H000000,Outline=2,MarginV=120"
    
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"subtitles={subtitle_path}:force_style='{subtitle_style}'",
        "-c:a", "copy",
        str(output_path)
    ], check=True, stderr=subprocess.DEVNULL)


def convert_lrc_to_srt(lrc_path, srt_path):
    """Convert LRC format to SRT format."""
    with open(lrc_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    srt_entries = []
    for line in lines:
        # Parse LRC timestamp [mm:ss.xx]text
        match = re.match(r'\[(\d+):(\d+)\.(\d+)\](.*)', line)
        if match:
            mm, ss, cs, text = match.groups()
            start_ms = int(mm) * 60000 + int(ss) * 1000 + int(cs) * 10
            # Assume 3 second display duration
            end_ms = start_ms + 3000
            
            start_time = format_srt_time(start_ms)
            end_time = format_srt_time(end_ms)
            
            srt_entries.append({
                "start": start_ms,
                "start_str": start_time,
                "end_str": end_time,
                "text": text.strip()
            })
    
    # Write SRT
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, entry in enumerate(srt_entries, 1):
            f.write(f"{i}\n")
            f.write(f"{entry['start_str']} --> {entry['end_str']}\n")
            f.write(f"{entry['text']}\n\n")


def format_srt_time(ms):
    """Format milliseconds as SRT timestamp."""
    hours = ms // 3600000
    ms %= 3600000
    minutes = ms // 60000
    ms %= 60000
    seconds = ms // 1000
    ms %= 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}"


def export_covers(video_path, board_path, output_dir):
    """Export cover images in multiple aspect ratios."""
    board = json.loads(board_path.read_text())
    duration_sec = board["project"]["duration_sec"]
    
    # Extract cover at 1/3 into the video (good for reveal moment)
    cover_time = duration_sec / 3
    
    # 9:16 vertical cover
    cover_9x16 = output_dir / "cover-9x16.png"
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(cover_time), "-i", str(video_path),
        "-frames:v", "1", "-vf", f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        str(cover_9x16)
    ], check=True, stderr=subprocess.DEVNULL)
    
    # 3:4 cover for Xiaohongshu
    cover_3x4 = output_dir / "cover-3x4.png"
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(cover_time), "-i", str(video_path),
        "-frames:v", "1", "-vf", f"scale=1080:1440:force_original_aspect_ratio=increase,crop=1080:1440",
        str(cover_3x4)
    ], check=True, stderr=subprocess.DEVNULL)
    
    print(f"[run_photography] Covers exported: {cover_9x16}, {cover_3x4}")


def generate_titles(board_path):
    """Generate title candidates for photography compilation."""
    board = json.loads(board_path.read_text())
    project = board["project"]
    
    title_candidates = [
        "记录美好瞬间",
        "街头摄影故事",
        "用镜头定格时光",
        f"{len(project['beats']['segments'])}个难忘的瞬间",
        "这些笑容值得珍藏"
    ]
    
    hashtags = ["街头摄影", "拍立得", "记录生活", "人像摄影", "温暖瞬间"]
    
    return {
        "title_candidates": title_candidates,
        "hashtags": hashtags
    }


def package_output(board_path, output_dir):
    """Generate meta.json with titles and metadata."""
    board = json.loads(board_path.read_text())
    project = board["project"]
    
    titles = generate_titles(board_path)
    
    meta = {
        "schema_version": "1.0",
        "title_candidates": titles["title_candidates"],
        "hashtags": titles["hashtags"],
        "template": "photography",
        "duration_sec": project["duration_sec"],
        "segment_count": len(project["beats"]["segments"]),
        "source_credit": project["source_credit"],
        "bgm_path": project["bgm_path"],
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
            "cover_ctr": None
        }
    }
    
    meta_path = output_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(f"[run_photography] Metadata written: {meta_path}")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--mode", choices=["plan", "render", "full"], default="full")
    parser.add_argument("--input", help="photography-script.yaml (required for plan/full)")
    args = parser.parse_args()
    
    if args.mode in ("plan", "full") and not args.input:
        parser.error(f"--mode {args.mode} requires --input")
    
    board_path = ROOT / "photography-board.json"
    
    # Phase 1: Planning
    if args.mode in ("plan", "full"):
        plan_pipeline(Path(args.input))
    
    if args.mode == "plan":
        return
    
    # Phase 2: Rendering
    board = json.loads(board_path.read_text())
    slug = board["project"]["title"]
    output_dir = ROOT / "out" / "photography" / slug
    
    if args.mode in ("render", "full"):
        render_pipeline(board_path, output_dir)
        export_covers(output_dir / "video.mp4", board_path, output_dir)
        package_output(board_path, output_dir)
    
    print(f"[run_photography] Done! Output: {output_dir}")
    print(f"  video.mp4, cover-9x16.png, cover-3x4.png, meta.json")


if __name__ == "__main__":
    main()
