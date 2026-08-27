#!/usr/bin/env node
// Illustration generation for the active shortboard.json (F13).
//
// --generator codex (default): writes a prompt file + image-jobs.json job
//   manifest for an external agent to fulfill (no live API call). Run
//   import-generated-image.mjs once the master PNG exists.
// --generator api: calls the local Codex Image2 CLI directly. Retries on
//   failure, then DEGRADES to the placeholder art already in shortboard.json
//   with a loud warning (F19) — it never silently ships a broken asset.
//
// Exit codes: 0 = real image produced (api path) or job manifest written
// (codex path); 2 = api path degraded to placeholder after retries;
// 1 = hard error (bad input, missing style, etc).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStyle } from './style-library.mjs';
import { resolveCharacterReference, findReferenceFrame } from './resolve-character.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = {
    generator: 'codex',
    input: path.join(rootDir, 'shortboard.json'),
    maxAttempts: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--generator') args.generator = argv[++i];
    else if (argv[i] === '--input') args.input = path.resolve(argv[++i]);
    else if (argv[i] === '--max-attempts') args.maxAttempts = Number(argv[++i]);
  }
  return args;
}

function buildPrompt(shortboard, style, referenceFramePath) {
  const { project, scene } = shortboard;
  const referenceNote = referenceFramePath
    ? 'An input reference image of this recurring character is provided — match their face, hairstyle, age, outfit color, and body proportions exactly.'
    : project.character_lock
      ? `Recurring character: ${project.character_lock}. No prior reference exists yet — this generation establishes their look for future reuse.`
      : '';

  return [
    style.prompt,
    referenceNote,
    `Scene to illustrate: ${scene.visual}`,
    // inkling overlays hook/punchline as separate Remotion text layers
    // (HookText/PunchlineOverlay) — the illustration itself must stay
    // text-free, unlike upstream's optional baked-in caption mode.
    'Do not draw any text, letters, or captions anywhere in the image — the illustration must be entirely wordless.',
    'Single static illustration, no panels, no comic borders.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function assetSetFor(shortboard, styleFingerprint) {
  const safeTitle = shortboard.project.title
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'short';
  const hash = createHash('sha256')
    .update([safeTitle, styleFingerprint, shortboard.scene.visual].join('\n'))
    .digest('hex')
    .slice(0, 8);
  return `${safeTitle}-${hash}`;
}

// Written for both generators on success, so import-generated-image.mjs
// can consume either path uniformly — it only cares about the "scene" job's
// output_master, not which generator produced it.
function writeManifest({ generatorName, style, shortboard, assetSet, promptFile, prompt, outputMaster, references }) {
  const manifest = {
    generator: generatorName,
    style_id: style.id,
    style_fingerprint: shortboard.project.style_fingerprint,
    asset_set: assetSet,
    shortboard: path.relative(rootDir, path.resolve(rootDir, 'shortboard.json')),
    jobs: [
      {
        id: 'scene',
        role: 'scene',
        prompt_file: path.relative(rootDir, promptFile),
        prompt,
        output_master: path.relative(rootDir, outputMaster),
        references: references.map((r) => path.relative(rootDir, r)),
      },
    ],
  };
  const manifestPath = path.join(rootDir, 'image-jobs.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifestPath;
}

function runCodexPath(shortboard, style, referenceFramePath) {
  const assetSet = assetSetFor(shortboard, shortboard.project.style_fingerprint);
  const promptDir = path.join(rootDir, 'prompts', 'generated', 'codex', assetSet);
  const assetDir = path.join(rootDir, 'public', 'assets', 'generated', 'codex', assetSet);
  mkdirSync(promptDir, { recursive: true });
  mkdirSync(assetDir, { recursive: true });

  const prompt = buildPrompt(shortboard, style, referenceFramePath);
  const promptFile = path.join(promptDir, 'scene.txt');
  writeFileSync(promptFile, prompt.trim() + '\n');

  const outputMaster = path.join(assetDir, 'scene_master.png');
  const references = referenceFramePath
    ? [path.resolve(rootDir, referenceFramePath)]
    : style.references.map((r) => r.absolute_path);

  const manifestPath = writeManifest({
    generatorName: 'codex-image2', style, shortboard, assetSet, promptFile, prompt, outputMaster, references,
  });

  console.log(`wrote ${manifestPath}`);
  console.log(`wrote prompt ${promptFile}`);
  console.log(
    `next: have an agent generate ${path.relative(rootDir, outputMaster)} from the prompt, ` +
      `then run: node scripts/import-generated-image.mjs`,
  );
}

function runApiPath(shortboard, style, referenceFramePath, maxAttempts) {
  const imageCli = path.join(
    process.env.CODEX_HOME || path.join(homedir(), '.codex'),
    'skills/.system/imagegen/scripts/image_gen.py',
  );

  const assetSet = assetSetFor(shortboard, shortboard.project.style_fingerprint);
  const assetDir = path.join(rootDir, 'public', 'assets', 'generated', 'api', assetSet);
  mkdirSync(assetDir, { recursive: true });
  const promptDir = path.join(rootDir, 'prompts', 'generated', 'api', assetSet);
  mkdirSync(promptDir, { recursive: true });

  const prompt = buildPrompt(shortboard, style, referenceFramePath);
  const promptFile = path.join(promptDir, 'scene.txt');
  writeFileSync(promptFile, prompt.trim() + '\n');

  const outputMaster = path.join(assetDir, 'scene_master.png');
  const references = referenceFramePath
    ? [path.resolve(rootDir, referenceFramePath)]
    : style.references.map((r) => r.absolute_path);

  if (!existsSync(imageCli)) {
    console.warn(`[generate-image] Image CLI not found at ${imageCli}; degrading to placeholder art.`);
    return { degraded: true, outputMaster: null };
  }

  const operation = references.length > 0 ? 'edit' : 'generate';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execFileSync(
        process.env.PYTHON || 'python3',
        [
          imageCli,
          operation,
          '--model', 'gpt-image-2',
          ...references.flatMap((image) => ['--image', image]),
          '--prompt-file', promptFile,
          '--size', '1024x1536',
          '--quality', 'high',
          '--out', outputMaster,
        ],
        { cwd: rootDir, stdio: 'pipe' },
      );
      console.log(`[generate-image] attempt ${attempt}/${maxAttempts} succeeded: ${outputMaster}`);
      writeManifest({
        generatorName: 'codex-image2-api', style, shortboard, assetSet, promptFile, prompt, outputMaster, references,
      });
      return { degraded: false, outputMaster };
    } catch (err) {
      const message = err.stderr ? err.stderr.toString().trim().split('\n').slice(-3).join(' | ') : err.message;
      console.warn(`[generate-image] attempt ${attempt}/${maxAttempts} failed: ${message}`);
    }
  }

  console.warn(
    `[generate-image] DEGRADED: all ${maxAttempts} attempts failed. ` +
      'Falling back to the placeholder art already referenced in shortboard.json — ' +
      'this short is NOT ready to publish until real generation succeeds (F19).',
  );
  return { degraded: true, outputMaster: null };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const shortboard = JSON.parse(readFileSync(args.input, 'utf8'));
  const style = resolveStyle(rootDir, shortboard.project.style_id);
  const characterRecord = resolveCharacterReference(rootDir, shortboard.project.character_lock);
  const referenceFramePath = findReferenceFrame(characterRecord, style.id);

  if (args.generator === 'codex') {
    runCodexPath(shortboard, style, referenceFramePath);
    process.exit(0);
  }

  if (args.generator === 'api') {
    const result = runApiPath(shortboard, style, referenceFramePath, args.maxAttempts);
    process.exit(result.degraded ? 2 : 0);
  }

  console.error(`unknown --generator "${args.generator}" (expected codex|api)`);
  process.exit(1);
}

main();
