#!/usr/bin/env node
// Extracts the cover frame from a rendered video.mp4 (F16). Default frame:
// color_complete_sec — the moment the illustration finishes revealing,
// per PRD §4.5. A couple frames before is safer than exactly on the
// boundary, which can land one frame early/late depending on encoder
// rounding.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--video') args.video = path.resolve(argv[++i]);
    else if (argv[i] === '--shortboard') args.shortboard = path.resolve(argv[++i]);
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--at-sec') args.atSec = Number(argv[++i]);
  }
  if (!args.video || !args.out) {
    console.error('usage: export-cover.mjs --video <video.mp4> --out <cover.png> [--shortboard <shortboard.json>] [--at-sec N]');
    process.exit(1);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let atSec = args.atSec;
  if (atSec === undefined) {
    if (!args.shortboard) {
      console.error('need --at-sec or --shortboard to know when the color reveal completes');
      process.exit(1);
    }
    const shortboard = JSON.parse(readFileSync(args.shortboard, 'utf8'));
    atSec = Math.max(0, shortboard.project.beats.color_complete_sec - 0.1);
  }

  execFileSync(
    'ffmpeg',
    ['-y', '-ss', String(atSec), '-i', args.video, '-frames:v', '1', args.out],
    { stdio: 'pipe' },
  );
  console.log(`wrote ${args.out} (frame at ${atSec}s)`);
}

main();
