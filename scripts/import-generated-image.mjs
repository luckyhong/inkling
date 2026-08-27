#!/usr/bin/env node
// Consumes image-jobs.json once its output_master PNG has been produced
// (by an external agent for --generator codex, or directly for --generator
// api — see generate-image.mjs). Derives a bw plate via ffmpeg, points the
// active shortboard.json at both plates, and saves a character_lock
// reference frame on first generation for that lock (F18).
//
// Much simpler than upstream's import-codex-images.mjs: inkling never bakes
// captions into the illustration (hook/punchline are separate Remotion
// overlays), so there's no caption-region crop-detection to do — the master
// IS the color plate.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveCharacterReference } from './resolve-character.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = {
    manifest: path.join(rootDir, 'image-jobs.json'),
    shortboard: path.join(rootDir, 'shortboard.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') args.manifest = path.resolve(argv[++i]);
    else if (argv[i] === '--shortboard') args.shortboard = path.resolve(argv[++i]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.manifest)) {
    console.error(`missing manifest: ${args.manifest} (run generate-image.mjs first)`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  const job = manifest.jobs.find((j) => j.role === 'scene');
  const masterPath = path.resolve(rootDir, job.output_master);
  if (!existsSync(masterPath)) {
    console.error(`output_master not found: ${masterPath}\nHas the illustration been generated yet?`);
    process.exit(1);
  }

  const assetDir = path.dirname(masterPath);
  const colorPath = path.join(assetDir, 'scene_color.png');
  const bwPath = path.join(assetDir, 'scene_bw.png');

  // color plate = the master itself (no caption strip to crop, unlike upstream)
  execFileSync('ffmpeg', ['-y', '-i', masterPath, '-frames:v', '1', colorPath], { stdio: 'pipe' });

  // bw plate: grayscale + contrast/sharpen, matching upstream's line-art derive
  execFileSync(
    'ffmpeg',
    [
      '-y', '-i', masterPath,
      '-vf', 'format=gray,eq=contrast=1.18:brightness=0.035,unsharp=5:5:0.55:5:5:0',
      '-frames:v', '1', bwPath,
    ],
    { stdio: 'pipe' },
  );

  const shortboard = JSON.parse(readFileSync(args.shortboard, 'utf8'));
  shortboard.scene.assets.color = path.relative(path.join(rootDir, 'public'), colorPath);
  shortboard.scene.assets.bw = path.relative(path.join(rootDir, 'public'), bwPath);
  writeFileSync(args.shortboard, JSON.stringify(shortboard, null, 2) + '\n');
  console.log(`updated ${args.shortboard} scene.assets -> ${shortboard.scene.assets.color} / ${shortboard.scene.assets.bw}`);

  if (shortboard.project.character_lock) {
    const record = saveCharacterReference(
      rootDir,
      shortboard.project.character_lock,
      shortboard.project.style_id,
      colorPath,
    );
    console.log(
      `saved character reference (lock_hash=${record.lock_hash}, usage_count=${record.usage_count})`,
    );
  }
}

main();
