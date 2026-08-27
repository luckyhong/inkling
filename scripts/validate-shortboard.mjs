#!/usr/bin/env node
// Validates one or more shortboard.json files against the beat contract
// (PRD §4.2, §6.2 F11). Manual field checks, no schema library — mirrors
// upstream's scripts/validate-storyboard.mjs style.

import { readFileSync } from 'node:fs';

const RATIO_MIN = 0.70;
const RATIO_MAX = 0.85;
const RATIO_EPSILON = 0.005; // tolerance for rounding in plan-short's output
const MAX_DURATION_SEC = 30;

function validate(shortboard, file) {
  const errors = [];
  const push = (field, message) => errors.push(`${file}: ${field} — ${message}`);

  if (shortboard.schema_version !== '1.0') {
    push('schema_version', `expected "1.0", got ${JSON.stringify(shortboard.schema_version)}`);
  }

  const project = shortboard.project ?? {};
  const scene = shortboard.scene ?? {};
  const beats = project.beats ?? {};

  if (!scene.hook_text || typeof scene.hook_text !== 'string' || !scene.hook_text.trim()) {
    push('scene.hook_text', 'missing or empty — every short needs a readable hook');
  }

  if (!scene.punchline_text || typeof scene.punchline_text !== 'string' || !scene.punchline_text.trim()) {
    push('scene.punchline_text', 'missing or empty — no short may end without a punchline');
  }

  if (typeof project.duration_sec !== 'number' || project.duration_sec <= 0) {
    push('project.duration_sec', `must be a positive number, got ${JSON.stringify(project.duration_sec)}`);
  } else if (project.duration_sec > MAX_DURATION_SEC) {
    push('project.duration_sec', `${project.duration_sec}s exceeds the ${MAX_DURATION_SEC}s cap`);
  }

  if (
    typeof project.duration_sec === 'number' &&
    project.duration_sec > 0 &&
    typeof beats.color_complete_sec === 'number'
  ) {
    const revealRatio = beats.color_complete_sec / project.duration_sec;
    if (revealRatio < RATIO_MIN - RATIO_EPSILON || revealRatio > RATIO_MAX + RATIO_EPSILON) {
      push(
        'project.beats.color_complete_sec',
        `reveal completes at ${(revealRatio * 100).toFixed(1)}% of duration, outside the [${RATIO_MIN * 100}%, ${RATIO_MAX * 100}%] beat contract`,
      );
    }
  } else {
    push('project.beats.color_complete_sec', 'missing');
  }

  if (typeof beats.hook_end_sec !== 'number' || beats.hook_end_sec <= 0) {
    push('project.beats.hook_end_sec', 'missing or non-positive');
  }

  const requiredLayers = ['hook_text', 'punchline_text'];
  const layers = Array.isArray(scene.layers) ? scene.layers : [];
  for (const layer of requiredLayers) {
    if (!layers.includes(layer)) {
      push('scene.layers', `missing required layer "${layer}"`);
    }
  }

  return errors;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: validate-shortboard.mjs <shortboard.json> [more.json...]');
    process.exit(1);
  }

  let allErrors = [];
  for (const file of files) {
    const shortboard = JSON.parse(readFileSync(file, 'utf8'));
    allErrors = allErrors.concat(validate(shortboard, file));
  }

  if (allErrors.length > 0) {
    console.error(`shortboard validation failed (${allErrors.length} issue(s)):`);
    for (const err of allErrors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`shortboard validation passed for ${files.length} file(s)`);
}

main();
