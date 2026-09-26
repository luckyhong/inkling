#!/usr/bin/env node
// photography-script.yaml -> photography-board.json
// Planning for the photography compilation template: multi-segment editing
// with beat detection, speed ramping, and rhythm-aware cuts.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { out: path.join(rootDir, 'photography-board.json'), overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
  }
  if (!args.input) {
    console.error('usage: plan-photography.mjs --input <photography-script.yaml> [--out <photography-board.json>]');
    process.exit(1);
  }
  return args;
}

function loadTemplateConfig() {
  const file = path.join(rootDir, 'templates', 'photography.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Beat detection using ffmpeg's silencedetect as a proxy for onset detection
// Falls back to fixed BPM if detection fails
function detectBeats(audioPath, durationSec, fallbackBpm) {
  try {
    // Use ffmpeg's astats to find transients/peaks as beat markers
    const result = execFileSync(
      'ffmpeg',
      [
        '-i', audioPath,
        '-af', 'silencedetect=n=-50dB:d=0.1,astats=metadata=1:reset=1',
        '-f', 'null',
        '-'
      ],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }
    );
    
    // Parse output for beat-like events
    const beats = [];
    const lines = result.split('\n');
    let lastBeat = -1;
    const minBeatInterval = 0.3; // 200 BPM max
    
    for (const line of lines) {
      const match = line.match(/t:\s*([\d.]+)/);
      if (match) {
        const time = parseFloat(match[1]);
        if (time - lastBeat >= minBeatInterval && time <= durationSec) {
          beats.push(time);
          lastBeat = time;
        }
      }
    }
    
    if (beats.length > 4) {
      return beats;
    }
  } catch (err) {
    console.warn('[plan-photography] Beat detection failed, using fixed BPM');
  }
  
  // Fallback to fixed BPM
  const beatInterval = 60 / fallbackBpm;
  const beats = [];
  for (let t = 0; t <= durationSec; t += beatInterval) {
    beats.push(parseFloat(t.toFixed(3)));
  }
  return beats;
}

function getClipDuration(clipPath) {
  try {
    const result = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        clipPath
      ],
      { encoding: 'utf8' }
    );
    return parseFloat(result.trim());
  } catch (err) {
    console.error(`Failed to get duration for ${clipPath}:`, err.message);
    return 0;
  }
}

function planSegmentCuts(segment, segmentDuration, beats, config, isFirst, isHook) {
  const cuts = [];
  const clipDuration = getClipDuration(segment.clip_path);
  
  if (clipDuration === 0) {
    console.warn(`Skipping segment ${segment.clip_path} - invalid duration`);
    return { cuts, clipDuration: 0 };
  }
  
  const inPoint = segment.in_point_sec || 0;
  const outPoint = segment.out_point_sec || clipDuration;
  const availableDuration = outPoint - inPoint;
  
  if (availableDuration <= 0) {
    console.warn(`Skipping segment ${segment.clip_path} - invalid in/out points`);
    return { cuts, clipDuration: 0 };
  }
  
  // Calculate cut durations based on position in video
  const frontHalfDuration = segmentDuration * 0.5;
  const cutDuration = isHook 
    ? config.hook_cut_duration_sec 
    : (isFirst ? config.fast_cut_duration_sec : config.fast_cut_duration_sec * 1.2);
  
  let currentTime = 0;
  let clipTime = inPoint;
  
  // Front half: fast cuts on beats
  while (currentTime < frontHalfDuration && clipTime < outPoint) {
    const duration = Math.min(cutDuration, frontHalfDuration - currentTime, outPoint - clipTime);
    cuts.push({
      start_sec: parseFloat(currentTime.toFixed(3)),
      duration_sec: parseFloat(duration.toFixed(3)),
      clip_time_sec: parseFloat(clipTime.toFixed(3)),
      speed: 1.0
    });
    currentTime += duration;
    clipTime += duration;
  }
  
  // Back half: slower cuts for reactions
  while (currentTime < segmentDuration && clipTime < outPoint) {
    const duration = Math.min(config.slow_cut_duration_sec, segmentDuration - currentTime, outPoint - clipTime);
    cuts.push({
      start_sec: parseFloat(currentTime.toFixed(3)),
      duration_sec: parseFloat(duration.toFixed(3)),
      clip_time_sec: parseFloat(clipTime.toFixed(3)),
      speed: 1.0
    });
    currentTime += duration;
    clipTime += duration;
  }
  
  return { cuts, clipDuration };
}

function planSegments(script, config, beats) {
  const segments = [];
  let currentTime = 0;
  
  for (let i = 0; i < script.segments.length; i++) {
    const segment = script.segments[i];
    const isFirst = i === 0;
    const isHook = currentTime < config.hook_window_sec;
    const targetDuration = isFirst 
      ? config.first_segment_duration_sec 
      : config.later_segment_duration_sec;
    
    const { cuts, clipDuration } = planSegmentCuts(segment, targetDuration, beats, config, isFirst, isHook);
    
    if (cuts.length === 0) {
      continue;
    }
    
    const actualDuration = cuts.reduce((sum, cut) => sum + cut.duration_sec, 0);
    
    segments.push({
      index: i,
      start_sec: parseFloat(currentTime.toFixed(3)),
      end_sec: parseFloat((currentTime + actualDuration).toFixed(3)),
      clip_path: segment.clip_path,
      still_photo_path: segment.still_photo_path || null,
      cuts,
      reveal_time_sec: segment.reveal_time_sec,
      walk_start_sec: segment.walk_start_sec,
      walk_end_sec: segment.walk_end_sec,
      walk_speed_multiplier: segment.walk_start_sec != null && segment.walk_end_sec != null 
        ? config.walk_speed_multiplier 
        : 1.0,
      reaction_start_sec: segment.reaction_start_sec
    });
    
    currentTime += actualDuration;
  }
  
  return segments;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const script = yaml.load(readFileSync(path.resolve(args.input), 'utf8'));
  const config = loadTemplateConfig();
  
  if (script.template !== 'photography') {
    console.error('This script only handles photography templates');
    process.exit(1);
  }
  
  if (!script.segments || script.segments.length < 3 || script.segments.length > 5) {
    console.error('Photography template requires 3-5 segments');
    process.exit(1);
  }
  
  if (!existsSync(script.bgm_path)) {
    console.error(`BGM file not found: ${script.bgm_path}`);
    process.exit(1);
  }
  
  // Detect beats from BGM
  const estimatedDuration = config.first_segment_duration_sec + 
    (script.segments.length - 1) * config.later_segment_duration_sec;
  const fallbackBpm = script.bgm_bpm || config.default_bpm;
  
  console.log('[plan-photography] Detecting beats from BGM...');
  const beats = detectBeats(script.bgm_path, estimatedDuration, fallbackBpm);
  console.log(`[plan-photography] Found ${beats.length} beats`);
  
  // Plan segment cuts
  console.log('[plan-photography] Planning segment cuts...');
  const segments = planSegments(script, config, beats);
  
  const totalDuration = segments.length > 0 
    ? segments[segments.length - 1].end_sec 
    : 0;
  
  const photographyBoard = {
    schema_version: '1.0',
    project: {
      title: script.title,
      template: 'photography',
      width: 1080,
      height: 1920,
      fps: 30,
      duration_sec: parseFloat(totalDuration.toFixed(3)),
      bgm_path: script.bgm_path,
      subtitle_path: script.subtitle_path || null,
      subtitle_type: script.subtitle_type || null,
      source_credit: script.source_credit || null,
      beats: {
        segments,
        beat_times_sec: beats
      }
    },
    config
  };
  
  writeFileSync(args.out, JSON.stringify(photographyBoard, null, 2) + '\n');
  console.log(`wrote ${args.out}`);
  console.log(`  segments=${segments.length} duration=${totalDuration.toFixed(1)}s beats=${beats.length}`);
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    console.log(`  segment ${i + 1}: ${seg.start_sec.toFixed(1)}s-${seg.end_sec.toFixed(1)}s (${seg.cuts.length} cuts)`);
  }
}

main();
