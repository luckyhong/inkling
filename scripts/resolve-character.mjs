// character_lock reference-frame storage (F18, docs/schema.md §4).
// First generation for a given character_lock saves its frame here;
// later generations with the same lock reuse it instead of re-rolling
// the character's appearance from scratch.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function lockHash(characterLock) {
  if (!characterLock) return null;
  return createHash('sha256').update(characterLock).digest('hex').slice(0, 12);
}

function referenceDir(rootDir, hash) {
  return path.join(rootDir, 'styles', 'characters', hash);
}

function referenceJsonPath(rootDir, hash) {
  return path.join(referenceDir(rootDir, hash), 'reference.json');
}

/**
 * Look up an existing character reference. Returns null if character_lock
 * is unset, or if this is the first time this lock has been used.
 */
export function resolveCharacterReference(rootDir, characterLock) {
  const hash = lockHash(characterLock);
  if (!hash) return null;

  const jsonPath = referenceJsonPath(rootDir, hash);
  if (!existsSync(jsonPath)) return null;

  return JSON.parse(readFileSync(jsonPath, 'utf8'));
}

/**
 * Find a reference frame for a specific style within a character's record,
 * if one was saved from a prior generation in that style.
 */
export function findReferenceFrame(record, styleId) {
  if (!record) return null;
  const frame = record.reference_frames.find((f) => f.style_id === styleId);
  return frame ? frame.frame_path : null;
}

/**
 * Save (or update) a character's reference frame after a real generation.
 * sourceFramePath is copied into styles/characters/<hash>/ so the store is
 * self-contained. Returns the updated record.
 */
export function saveCharacterReference(rootDir, characterLock, styleId, sourceFramePath) {
  const hash = lockHash(characterLock);
  if (!hash) throw new Error('saveCharacterReference requires a non-empty character_lock');

  const dir = referenceDir(rootDir, hash);
  mkdirSync(dir, { recursive: true });

  const ext = path.extname(sourceFramePath) || '.png';
  const destName = `${styleId}_ref${ext}`;
  const destPath = path.join(dir, destName);
  copyFileSync(sourceFramePath, destPath);

  const jsonPath = referenceJsonPath(rootDir, hash);
  const relativeFramePath = path.relative(rootDir, destPath);

  let record = existsSync(jsonPath)
    ? JSON.parse(readFileSync(jsonPath, 'utf8'))
    : {
        lock_hash: hash,
        character_lock_text: characterLock,
        created_at: new Date().toISOString(),
        reference_frames: [],
        usage_count: 0,
      };

  const existingFrame = record.reference_frames.find((f) => f.style_id === styleId);
  if (existingFrame) {
    existingFrame.frame_path = relativeFramePath;
  } else {
    record.reference_frames.push({ style_id: styleId, frame_path: relativeFramePath });
  }
  record.usage_count += 1;

  writeFileSync(jsonPath, JSON.stringify(record, null, 2) + '\n');
  return record;
}

function main() {
  const characterLock = process.argv[2];
  if (!characterLock) {
    console.error('usage: resolve-character.mjs "<character_lock text>"');
    process.exit(1);
  }
  const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
  const record = resolveCharacterReference(rootDir, characterLock);
  if (!record) {
    console.log(`lock_hash=${lockHash(characterLock)} — no reference on file yet (first use)`);
  } else {
    console.log(JSON.stringify(record, null, 2));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
