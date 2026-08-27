#!/usr/bin/env node
// short-script.yaml -> shortboard.json
// Phase 1 scope: pure planning, no image generation. Assets are pinned to
// the generic placeholder art (public/assets/placeholder_*.svg) so the
// Remotion timeline can be previewed before Phase 2 wires up real generation.
// See docs/schema.md §1/§2/§5 for the contracts this implements.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { resolveStyle as resolveLibraryStyle } from './style-library.mjs';
import { lockHash } from './resolve-character.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const BW_FRACTION = 0.45; // see docs/schema.md beat algorithm — unvalidated assumption

function parseArgs(argv) {
  const args = { out: path.join(rootDir, 'shortboard.json') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
  }
  if (!args.input) {
    console.error('usage: plan-short.mjs --input <short-script.yaml> [--out <shortboard.json>]');
    process.exit(1);
  }
  return args;
}

function loadTemplateConfig(template) {
  const file = path.join(rootDir, 'templates', `${template}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveTemplateStyleId(script, templateConfig) {
  const requested = script.style ?? templateConfig.style_suggestions[0];
  if (templateConfig.style_lock && requested !== templateConfig.style_lock) {
    if (script.style) {
      console.warn(
        `[plan-short] template "${templateConfig.template}" forces style "${templateConfig.style_lock}"; ignoring requested style "${script.style}"`,
      );
    }
    return templateConfig.style_lock;
  }
  return requested;
}

// Real fingerprint (was a "placeholder" string in Phase 1, before the style
// library existed): sha256 over style metadata + reference image bytes,
// mirroring upstream's story-to-video.mjs. Purely a function of the style
// definition, so it's computable at plan time — no image generation needed.
function computeStyleFingerprint(style) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      library_version: style.library_version,
      id: style.id,
      name_zh: style.name_zh,
      prompt: style.prompt,
      color_hint: style.color_hint,
      avoid: style.avoid,
      references: style.references.map(({ path: p, role }) => ({ path: p, role })),
    }),
  );
  for (const reference of style.references) {
    hash.update(readFileSync(reference.absolute_path));
  }
  return hash.digest('hex').slice(0, 16);
}

function computeBeats(durationSec, ratio) {
  const hookEnd = Math.min(1.2, durationSec * 0.08);
  const drawStart = hookEnd;
  const colorComplete = durationSec * Math.min(0.85, Math.max(0.7, ratio));
  const bwComplete = drawStart + (colorComplete - drawStart) * BW_FRACTION;
  return {
    hook_end_sec: round2(hookEnd),
    draw_start_sec: round2(drawStart),
    bw_complete_sec: round2(bwComplete),
    color_complete_sec: round2(colorComplete),
    punchline_start_sec: round2(colorComplete),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// js-yaml v4 follows YAML 1.2: "on"/"off" parse as plain strings, not
// booleans (unlike YAML 1.1). Normalize explicitly so `sfx: off` in a
// short-script.yaml actually disables the track instead of being truthy.
function toBool(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['on', 'yes', 'true'].includes(normalized)) return true;
  if (['off', 'no', 'false'].includes(normalized)) return false;
  return defaultValue;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const script = yaml.load(readFileSync(path.resolve(args.input), 'utf8'));
  const templateConfig = loadTemplateConfig(script.template);

  const durationSec = script.duration_sec ?? templateConfig.duration_sec;
  const requestedStyleId = resolveTemplateStyleId(script, templateConfig);
  const styleRecord = resolveLibraryStyle(rootDir, requestedStyleId);
  const styleId = styleRecord.id;
  const styleFingerprint = computeStyleFingerprint(styleRecord);
  const beats = computeBeats(durationSec, templateConfig.ratio);
  const characterLock = script.character_lock ?? null;

  const shortboard = {
    schema_version: '1.0',
    project: {
      title: script.title,
      template: script.template,
      width: 1080,
      height: 1440,
      fps: 30,
      duration_sec: durationSec,
      style_id: styleId,
      style_fingerprint: styleFingerprint,
      character_lock: characterLock,
      character_reference_id: lockHash(characterLock),
      sfx: toBool(script.sfx, true),
      beats,
    },
    scene: {
      id: '01',
      hook_text: script.hook,
      punchline_text: script.punchline,
      visual: script.template === 'twist' && script.reveal_visual ? script.reveal_visual : script.visual,
      credit_to: script.credit_to ?? null,
      layers: ['hook_text', 'bw_full', 'color', 'punchline_text'],
      assets: {
        bw: 'assets/placeholder_bw.svg',
        color: 'assets/placeholder_color.svg',
      },
    },
  };

  writeFileSync(args.out, JSON.stringify(shortboard, null, 2) + '\n');
  console.log(`wrote ${args.out}`);
  console.log(`  template=${shortboard.project.template} style=${shortboard.project.style_id} duration=${durationSec}s`);
  console.log(`  beats=${JSON.stringify(beats)}`);
}

main();
