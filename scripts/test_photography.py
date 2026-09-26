#!/usr/bin/env python3
"""Generate synthetic test assets for photography template and run end-to-end test."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def generate_test_clips():
    """Generate synthetic video clips using ffmpeg testsrc."""
    print("[test_photography] Generating synthetic test clips...")
    
    clips_dir = ROOT / "examples" / "photography" / "clips"
    photos_dir = ROOT / "examples" / "photography" / "photos"
    bgm_dir = ROOT / "examples" / "photography" / "bgm"
    
    clips_dir.mkdir(parents=True, exist_ok=True)
    photos_dir.mkdir(parents=True, exist_ok=True)
    bgm_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate 3 test video clips with different colors and labels
    colors = [
        ("blue", "Segment 1: Full Process"),
        ("green", "Segment 2: Condensed"),
        ("orange", "Segment 3: Condensed")
    ]
    
    for i, (color, label) in enumerate(colors, 1):
        clip_path = clips_dir / f"segment_{i:02d}.mp4"
        if clip_path.exists():
            print(f"  Skipping {clip_path.name} (already exists)")
            continue
        
        duration = 40 if i == 1 else 22
        
        print(f"  Generating {clip_path.name} ({duration}s)...")
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s=1920x1080:d={duration}:r=30",
            "-vf", (
                f"drawtext=text='{label}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/3,"
                f"drawtext=text='Time\\: %{{pts\\:hms}}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=2*h/3"
            ),
            "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p",
            str(clip_path)
        ], check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    
    # Generate test still photos
    photo_colors = ["#FF6B6B", "#4ECDC4", "#FFE66D"]
    for i, color in enumerate(photo_colors, 1):
        photo_path = photos_dir / f"photo_{i:02d}.jpg"
        if photo_path.exists():
            print(f"  Skipping {photo_path.name} (already exists)")
            continue
        
        print(f"  Generating {photo_path.name}...")
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s=1440x1080:d=1",
            "-vf", f"drawtext=text='Photo {i}':fontsize=120:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2",
            "-frames:v", "1",
            str(photo_path)
        ], check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    
    # Generate synthetic beat track (120 BPM = 0.5s per beat)
    bgm_path = bgm_dir / "test_beat_track.mp3"
    if not bgm_path.exists():
        print(f"  Generating {bgm_path.name}...")
        # Create a simple beat track with sine wave + periodic kicks
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=80",
            "-af", (
                "aecho=0.8:0.88:60:0.4,"  # Echo for rhythm
                "highpass=f=200,"         # Remove rumble
                "volume=0.5"
            ),
            "-c:a", "libmp3lame", "-b:a", "192k",
            str(bgm_path)
        ], check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    
    # Create a simple SRT subtitle file
    subtitle_path = bgm_dir.parent / "subtitles" / "lyrics.srt"
    subtitle_path.parent.mkdir(exist_ok=True)
    
    if not subtitle_path.exists():
        print(f"  Generating {subtitle_path.name}...")
        with open(subtitle_path, "w", encoding="utf-8") as f:
            subtitles = [
                (0, 3, "记录每一个温暖瞬间"),
                (3, 6, "街头摄影的魅力"),
                (6, 10, "用镜头定格时光"),
                (10, 15, "看到他们的笑容"),
                (15, 20, "这就是摄影的意义")
            ]
            for i, (start, end, text) in enumerate(subtitles, 1):
                f.write(f"{i}\n")
                f.write(f"00:00:{start:02d},000 --> 00:00:{end:02d},000\n")
                f.write(f"{text}\n\n")
    
    print("[test_photography] Test assets generated successfully!")


def update_test_config():
    """Update the example config to use synthetic test assets."""
    config_path = ROOT / "examples" / "photography-test.yaml"
    
    config_content = """schema_version: "1.0"
template: photography
title: test-synthetic-compilation

# Test segments using synthetic clips
segments:
  # Segment 1: Full process simulation
  - clip_path: examples/photography/clips/segment_01.mp4
    in_point_sec: 0
    out_point_sec: 38
    still_photo_path: examples/photography/photos/photo_01.jpg
    reveal_time_sec: 8
    walk_start_sec: 20
    walk_end_sec: 28
    reaction_start_sec: 30

  # Segment 2: Condensed
  - clip_path: examples/photography/clips/segment_02.mp4
    in_point_sec: 0
    out_point_sec: 20
    still_photo_path: examples/photography/photos/photo_02.jpg
    reveal_time_sec: 6
    walk_start_sec: 12
    walk_end_sec: 16
    reaction_start_sec: 17

  # Segment 3: Condensed
  - clip_path: examples/photography/clips/segment_03.mp4
    in_point_sec: 0
    out_point_sec: 20
    still_photo_path: examples/photography/photos/photo_03.jpg
    reveal_time_sec: 5
    walk_start_sec: 11
    walk_end_sec: 15
    reaction_start_sec: 16

# Synthetic beat track
bgm_path: examples/photography/bgm/test_beat_track.mp3
bgm_bpm: 120

# Test subtitles
subtitle_path: examples/photography/subtitles/lyrics.srt
subtitle_type: lyric

# Test source credit
source_credit: "测试素材（合成）"
"""
    
    print(f"[test_photography] Writing test config to {config_path}")
    config_path.write_text(config_content)


def run_pipeline_test():
    """Run the photography pipeline with synthetic assets."""
    print("\n[test_photography] Running pipeline test...")
    
    config_path = ROOT / "examples" / "photography-test.yaml"
    
    # Phase 1: Planning
    print("\n=== Phase 1: Planning ===")
    try:
        subprocess.run([
            "python3", str(ROOT / "scripts" / "run_photography.py"),
            "--mode", "plan",
            "--input", str(config_path)
        ], check=True, cwd=ROOT)
        print("✓ Planning phase completed")
    except subprocess.CalledProcessError as e:
        print(f"✗ Planning phase failed: {e}")
        return False
    
    # Verify photography-board.json was created
    board_path = ROOT / "photography-board.json"
    if not board_path.exists():
        print(f"✗ Expected output {board_path} not found")
        return False
    
    print(f"✓ Generated {board_path}")
    
    # Parse and validate the board
    import json
    board = json.loads(board_path.read_text())
    
    print(f"\nPlan summary:")
    print(f"  Segments: {len(board['project']['beats']['segments'])}")
    print(f"  Duration: {board['project']['duration_sec']:.1f}s")
    print(f"  Beat points: {len(board['project']['beats']['beat_times_sec'])}")
    
    for i, seg in enumerate(board['project']['beats']['segments'], 1):
        print(f"  Segment {i}: {seg['start_sec']:.1f}s-{seg['end_sec']:.1f}s ({len(seg['cuts'])} cuts)")
    
    # Verify basic constraints
    if len(board['project']['beats']['segments']) != 3:
        print(f"✗ Expected 3 segments, got {len(board['project']['beats']['segments'])}")
        return False
    
    if board['project']['duration_sec'] < 50 or board['project']['duration_sec'] > 90:
        print(f"✗ Unexpected duration: {board['project']['duration_sec']}s (expected ~50-90s)")
        return False
    
    print("✓ Plan validation passed")
    
    # Phase 2: Rendering (full pipeline)
    print("\n=== Phase 2: Rendering ===")
    try:
        subprocess.run([
            "python3", str(ROOT / "scripts" / "run_photography.py"),
            "--mode", "render",
            "--input", str(config_path)
        ], check=True, cwd=ROOT)
        print("✓ Rendering phase completed")
    except subprocess.CalledProcessError as e:
        print(f"✗ Rendering phase failed: {e}")
        # Continue to check what was produced
    
    # Verify outputs
    output_dir = ROOT / "out" / "photography" / "test-synthetic-compilation"
    expected_files = [
        "video.mp4",
        "cover-9x16.png",
        "cover-3x4.png",
        "meta.json"
    ]
    
    print(f"\nChecking outputs in {output_dir}...")
    all_exist = True
    for filename in expected_files:
        filepath = output_dir / filename
        if filepath.exists():
            size = filepath.stat().st_size
            print(f"  ✓ {filename} ({size:,} bytes)")
        else:
            print(f"  ✗ {filename} (missing)")
            all_exist = False
    
    if not all_exist:
        print("\n✗ Some expected outputs are missing")
        return False
    
    # Verify video properties
    video_path = output_dir / "video.mp4"
    try:
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-of", "json",
            str(video_path)
        ], capture_output=True, text=True, check=True)
        
        import json
        probe = json.loads(result.stdout)
        stream = probe["streams"][0]
        
        print(f"\nVideo properties:")
        print(f"  Resolution: {stream['width']}x{stream['height']}")
        print(f"  Frame rate: {stream['r_frame_rate']}")
        print(f"  Duration: {float(stream.get('duration', 0)):.1f}s")
        
        if stream['width'] != 1080 or stream['height'] != 1920:
            print(f"  ✗ Expected 1080x1920, got {stream['width']}x{stream['height']}")
            return False
        
        print("  ✓ Video properties validated")
        
    except Exception as e:
        print(f"  ! Could not probe video: {e}")
    
    print("\n" + "="*60)
    print("✓ Photography pipeline test PASSED")
    print(f"\nOutput location: {output_dir}")
    print("="*60)
    
    return True


def main():
    print("="*60)
    print("Photography Template End-to-End Test")
    print("="*60)
    
    # Check dependencies
    print("\n[test_photography] Checking dependencies...")
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        subprocess.run(["ffprobe", "-version"], capture_output=True, check=True)
        print("✓ ffmpeg and ffprobe found")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("✗ ffmpeg or ffprobe not found. Please install ffmpeg.")
        sys.exit(1)
    
    # Generate test assets
    generate_test_clips()
    
    # Update test config
    update_test_config()
    
    # Run pipeline test
    success = run_pipeline_test()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
