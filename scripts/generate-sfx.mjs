#!/usr/bin/env node
// Synthesizes short, loopable procedural sound-effect beds via ffmpeg's
// lavfi noise/filter graph — no recorded samples, no licensing to track.
// See PRD §4.3 "音效层": these are draw-noise textures, not voiceover/BGM.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Remotion's staticFile() only serves from public/, so generated assets
// must live there rather than under a top-level assets/ dir.
const outDir = path.join(__dirname, '..', 'public', 'assets', 'sfx');

const SAMPLE_RATE = 44100;
const DURATION_SEC = 2;

const sfx = [
  {
    file: 'paper-rustle.wav',
    desc: '极轻纸张声，Hook 阶段底噪',
    filter: `anoisesrc=d=${DURATION_SEC}:c=pink:r=${SAMPLE_RATE}:a=0.5,highpass=f=1200,lowpass=f=6000,tremolo=f=22:d=0.4,volume=0.12`,
  },
  {
    file: 'pencil-scratch.wav',
    desc: '铅笔沙沙声，黑白线稿揭示阶段',
    filter: `anoisesrc=d=${DURATION_SEC}:c=pink:r=${SAMPLE_RATE}:a=0.7,highpass=f=2000,lowpass=f=8000,tremolo=f=18:d=0.6,volume=0.35`,
  },
  {
    file: 'marker-squeak.wav',
    desc: '马克笔吱吱声，彩色揭示阶段',
    filter: `anoisesrc=d=${DURATION_SEC}:c=white:r=${SAMPLE_RATE}:a=0.6,highpass=f=3500,lowpass=f=9000,tremolo=f=9:d=0.5,volume=0.3`,
  },
  {
    file: 'crayon-stutter.wav',
    desc: '蜡笔顿挫声，彩色揭示阶段（较厚重风格）',
    filter: `anoisesrc=d=${DURATION_SEC}:c=brown:r=${SAMPLE_RATE}:a=0.8,highpass=f=800,lowpass=f=4000,tremolo=f=5:d=0.8,volume=0.4`,
  },
];

mkdirSync(outDir, { recursive: true });

for (const { file, desc, filter } of sfx) {
  const outPath = path.join(outDir, file);
  console.log(`generating ${file} (${desc})`);
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', filter,
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      outPath,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error(`ffmpeg failed for ${file} (exit ${result.status})`);
    process.exit(1);
  }
}

console.log(`done: ${sfx.length} sfx files written to ${outDir}`);
