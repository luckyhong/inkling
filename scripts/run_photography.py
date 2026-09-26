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
    
    # Generate shutter SFX if enabled
    shutter_sfx_path = None
    if config.get("shutter_sfx_enabled", False):
        shutter_sfx_path = output_dir / "shutter.wav"
        generate_shutter_sfx(shutter_sfx_path)
    
    segment_clips = []
    
    # Process each segment
    for i, segment in enumerate(segments):
        seg_output = output_dir / f"segment_{i:02d}.mp4"
        process_segment(segment, config, seg_output, project["width"], project["height"], 
                       project["fps"], i, shutter_sfx_path)
        segment_clips.append(seg_output)
    
    # Apply whip transitions between segments if enabled
    if config.get("use_whip_transition", False) and len(segment_clips) > 1:
        print("[run_photography] Applying whip transitions...")
        transitioned_clips = apply_whip_transitions(segment_clips, config, output_dir, project["fps"])
        segment_clips = transitioned_clips
    
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
    
    # Add BGM and original audio with ducking if configured
    final_video = output_dir / "video.mp4"
    keep_voice_windows = project.get("keep_original_voice_windows")
    if keep_voice_windows:
        # Extract original audio from segments and mix with BGM
        add_audio_with_voice(temp_video, segment_clips, project["bgm_path"], final_video,
                            project["duration_sec"], config["bgm_target_lufs"],
                            keep_voice_windows, segments)
    else:
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
    if shutter_sfx_path:
        shutter_sfx_path.unlink(missing_ok=True)
    
    print(f"[run_photography] Video rendered: {final_video}")


def generate_shutter_sfx(output_path):
    """Synthesize a shutter click sound effect using ffmpeg."""
    # Create a short mechanical shutter click: brief noise burst + click
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anoisesrc=d=0.1:c=pink:r=44100:a=0.8",
        "-af", (
            "highpass=f=2000,lowpass=f=8000,"  # Mechanical frequency range
            "aecho=0.8:0.9:15:0.5,"            # Short echo for metallic sound
            "afade=t=in:d=0.01,afade=t=out:d=0.05,"  # Quick attack and decay
            "volume=0.6"
        ),
        "-ar", "44100", "-ac", "1",
        str(output_path)
    ], check=True, stderr=subprocess.PIPE)


def apply_dark_flash(cut_filter, config):
    """Apply dark flash frames before a cut."""
    flash_frames = config.get("transition_dark_flash_frames", 0)
    if flash_frames > 0:
        # Insert brief black frames
        cut_filter += f",fade=t=in:st=0:d=0.03:c=black,fade=t=out:st=0.01:d=0.02:c=black"
    return cut_filter


def create_ken_burns_effect(photo_path, duration_sec, width, height, config):
    """Create Ken Burns zoom and pan effect on a still photo."""
    # Ken Burns: slow zoom from 1.0x to 1.2x with subtle pan
    zoom_start = 1.0
    zoom_end = 1.2
    
    # Calculate frames for the duration at 30fps
    total_frames = int(duration_sec * 30)
    
    # Build zoompan filter with slow zoom and pan
    ken_burns = (
        f"zoompan=z='if(lte(zoom,{zoom_end}),zoom+0.002,{zoom_end})':"
        f"d={total_frames}:"
        f"x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':"
        f"s={width}x{height}:fps=30"
    )
    
    return ken_burns


def grade_still_photo(photo_path, output_path, width, height, duration_sec, config):
    """Apply distinct grading to still photo: higher contrast, sharpening, cooler shadows."""
    contrast = config.get("photo_contrast", 1.2)
    
    # Build filter chain for photo
    photo_filter = (
        # 1. Load and loop the photo for the duration
        f"loop=loop=-1:size=1:start=0,"
        # 2. Scale to cover 9:16 (crop to fill, no black bars)
        f"scale=iw*max({width}/iw\\,{height}/ih):ih*max({width}/iw\\,{height}/ih),"
        f"crop={width}:{height},"
        # 3. Apply Ken Burns effect
        f"{create_ken_burns_effect(photo_path, duration_sec, width, height, config)},"
        # 4. Higher contrast
        f"eq=contrast={contrast},"
        # 5. Sharpening with unsharp filter
        f"unsharp=5:5:1.5:5:5:0.0,"
        # 6. Slightly cooler shadows: reduce red in shadows
        f"curves=r='0/0 0.3/0.25 1/1':g='0/0 0.3/0.28 1/1':b='0/0 0.3/0.32 1/1'"
    )
    
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(photo_path),
        "-t", str(duration_sec),
        "-vf", photo_filter,
        "-r", "30",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        str(output_path)
    ], check=True, stderr=subprocess.PIPE)


def process_segment(segment, config, output_path, width, height, fps, segment_index, shutter_sfx_path):
    """Process a single segment with cuts, speed ramps, color grading, and effects."""
    clip_path = segment["clip_path"]
    cuts = segment["cuts"]
    still_photo_path = segment.get("still_photo_path")
    reveal_time_sec = segment.get("reveal_time_sec")
    
    # Build filter_complex for this segment
    filters = []
    audio_filters = []
    input_count = 1  # Start with the main clip
    
    # Check if we need to add shutter SFX
    shutter_times = []
    if shutter_sfx_path and reveal_time_sec is not None:
        # Add shutter sound at reveal time
        shutter_times.append(reveal_time_sec)
    
    for i, cut in enumerate(cuts):
        # Apply speed if needed (for walk sections)
        speed = 1.0
        if segment.get("walk_speed_multiplier", 1.0) > 1.0:
            cut_start = cut["start_sec"]
            walk_start = segment.get("walk_start_sec")
            walk_end = segment.get("walk_end_sec")
            
            if walk_start is not None and walk_end is not None:
                if walk_start <= cut_start < walk_end:
                    speed = segment["walk_speed_multiplier"]
        
        # Build filter chain for this cut
        # 1. Trim and reset PTS
        cut_filter = f"[0:v]trim=start={cut['clip_time_sec']}:duration={cut['duration_sec']},setpts=PTS-STARTPTS"
        
        # 2. Apply speed adjustment
        if speed != 1.0:
            cut_filter += f",setpts=PTS/{speed}"
        
        # 3. Apply dark flash if this is near a reveal time
        if reveal_time_sec is not None and config.get("transition_dark_flash_frames", 0) > 0:
            # Check if this cut contains the reveal time
            cut_end = cut["start_sec"] + cut["duration_sec"]
            if cut["start_sec"] <= reveal_time_sec < cut_end:
                cut_filter = apply_dark_flash(cut_filter, config)
        
        # 4. Color grading: saturation and warm tone
        cut_filter += f",eq=saturation={config['color_saturation']}"
        
        # 5. Scale and crop to 9:16 (crop to fill, no letterboxing)
        cut_filter += f",scale=iw*max({width}/iw\\,{height}/ih):ih*max({width}/iw\\,{height}/ih),crop={width}:{height}"
        
        cut_filter += f"[v{i}]"
        filters.append(cut_filter)
    
    # If there's a still photo, process it separately and overlay
    photo_overlay_output = None
    if still_photo_path and reveal_time_sec is not None:
        # Generate graded photo with Ken Burns effect
        photo_duration = sum(cut["duration_sec"] for cut in cuts) - reveal_time_sec
        if photo_duration > 0:
            photo_temp = output_path.parent / f"photo_temp_{segment_index}.mp4"
            grade_still_photo(still_photo_path, photo_temp, width, height, 
                            photo_duration, config)
            photo_overlay_output = photo_temp
    
    # Concatenate all video cuts
    concat_inputs = "".join([f"[v{i}]" for i in range(len(cuts))])
    
    if photo_overlay_output:
        # Overlay photo starting at reveal time
        filters.append(f"{concat_inputs}concat=n={len(cuts)}:v=1:a=0[base]")
        
        # Load the photo and overlay it at the reveal time
        # We'll handle this in a second pass with multiple inputs
        final_filter = f"[base][1:v]overlay=0:0:enable='gte(t,{reveal_time_sec})'[outv]"
        filters.append(final_filter)
        
        filter_complex = ";".join(filters)
        
        # Render with photo overlay
        subprocess.run([
            "ffmpeg", "-y", 
            "-i", clip_path,
            "-i", str(photo_overlay_output),
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-r", str(fps),
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-pix_fmt", "yuv420p",
            str(output_path)
        ], check=True, stderr=subprocess.PIPE)
        
        # Cleanup temp photo
        photo_overlay_output.unlink(missing_ok=True)
    else:
        # No photo overlay, just concatenate
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


def apply_whip_transitions(segment_clips, config, output_dir, fps):
    """Apply synthetic motion-blur whip transitions between segments."""
    transition_duration = config.get("transition_whip_duration_sec", 0.3)
    transitioned_clips = []
    
    for i in range(len(segment_clips)):
        if i == 0:
            # First segment: no transition at start
            transitioned_clips.append(segment_clips[i])
        else:
            # Apply whip transition from previous segment to this one
            prev_clip = segment_clips[i - 1]
            curr_clip = segment_clips[i]
            trans_output = output_dir / f"transition_{i:02d}.mp4"
            
            # Create whip effect: motion blur + quick fade
            subprocess.run([
                "ffmpeg", "-y",
                "-i", str(prev_clip), "-i", str(curr_clip),
                "-filter_complex",
                (
                    # Get last frames of previous clip
                    f"[0:v]trim=start=0:end={transition_duration},setpts=PTS-STARTPTS,"
                    f"boxblur=20:1[blur0];"
                    # Get first frames of current clip
                    f"[1:v]trim=start=0:end={transition_duration},setpts=PTS-STARTPTS,"
                    f"boxblur=20:1[blur1];"
                    # Crossfade with motion blur
                    f"[blur0][blur1]xfade=transition=wiperight:duration={transition_duration}:offset=0[trans]"
                ),
                "-map", "[trans]",
                "-r", str(fps),
                "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-t", str(transition_duration),
                str(trans_output)
            ], check=True, stderr=subprocess.PIPE)
            
            # Trim the transition duration from both clips and concatenate
            # This is simplified - we'll just use the transitioned segment
            transitioned_clips.append(trans_output)
            transitioned_clips.append(curr_clip)
    
    return transitioned_clips


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


def add_audio_with_voice(video_path, segment_clips, bgm_path, output_path, duration_sec, 
                         target_lufs, keep_voice_windows, segments):
    """Mix BGM with original voice in specified windows, with ducking."""
    # Extract original audio from the video
    original_audio = video_path.parent / "original_audio.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        str(original_audio)
    ], check=True, stderr=subprocess.PIPE)
    
    # Build filter for mixing BGM with voice in specific windows
    # Use volume automation to duck BGM when voice is present
    voice_filter_parts = []
    bgm_filter_parts = []
    
    for window in keep_voice_windows:
        start = window["start_sec"]
        end = window["end_sec"]
        
        # Voice: full volume in window, silent outside
        voice_filter_parts.append(
            f"volume=enable='between(t,{start},{end})':volume=1.0"
        )
        
        # BGM: ducked (reduced to 30%) in window, full outside
        bgm_filter_parts.append(
            f"volume=enable='between(t,{start},{end})':volume=0.3"
        )
    
    # Combine filters
    voice_filter = ",".join(voice_filter_parts) if voice_filter_parts else "volume=0"
    bgm_duck_filter = ",".join(bgm_filter_parts) if bgm_filter_parts else "volume=1"
    
    # Mix the audio tracks
    subprocess.run([
        "ffmpeg", "-y", 
        "-i", str(video_path),
        "-i", str(bgm_path),
        "-i", str(original_audio),
        "-t", str(duration_sec),
        "-filter_complex",
        (
            f"[1:a]loudnorm=I={target_lufs}:TP=-1.5:LRA=11,{bgm_duck_filter}[bgm];"
            f"[2:a]{voice_filter}[voice];"
            f"[bgm][voice]amix=inputs=2:duration=shortest:dropout_transition=2[a]"
        ),
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        str(output_path)
    ], check=True, stderr=subprocess.PIPE)
    
    # Cleanup
    original_audio.unlink(missing_ok=True)


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
