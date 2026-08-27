// Loader for styles/style-library.json — a 6-style subset vendored from
// story-to-handdrawn-video's references/handdrawn-style-library.json.
// Ported from that repo's scripts/handdrawn-style-library.mjs, simplified:
// no example_image/contact_sheet (not vendored to keep the subset small).

import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const styleLibraryPath = (root) => resolve(root, 'styles', 'style-library.json');

const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

export const loadStyleLibrary = (root) => {
  const path = styleLibraryPath(root);
  if (!existsSync(path)) throw new Error(`Missing style library: ${path}`);

  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(catalog.styles) || catalog.styles.length === 0) {
    throw new Error(`Style library has no styles: ${path}`);
  }

  const selectors = new Map();
  for (const style of catalog.styles) {
    if (!style.id || !style.name_zh || !Number.isInteger(style.order)) {
      throw new Error(`Invalid style record in ${path}`);
    }
    const keys = [style.id, style.name_zh, style.name_en, String(style.order), ...(style.aliases || [])];
    for (const key of keys) {
      const key2 = normalize(key);
      if (!key2) continue;
      selectors.set(key2, style.id);
    }
    if (!style.profile_file && !Array.isArray(style.prompt_blocks)) {
      throw new Error(`Style ${style.id} needs profile_file or prompt_blocks`);
    }
  }

  if (!catalog.styles.some((style) => style.id === catalog.default_style)) {
    throw new Error(`Default style ${catalog.default_style} is not defined in ${path}`);
  }

  return {catalog, path, selectors};
};

export const resolveStyle = (root, selector) => {
  const library = loadStyleLibrary(root);
  const requested = normalize(selector || library.catalog.default_style);
  const styleId = library.selectors.get(requested);
  if (!styleId) {
    const available = library.catalog.styles
      .sort((a, b) => a.order - b.order)
      .map((style) => `${style.order}:${style.id}`)
      .join(', ');
    throw new Error(`Unknown style "${selector}". Available: ${available}`);
  }

  const style = library.catalog.styles.find((item) => item.id === styleId);
  const profilePath = style.profile_file ? resolve(root, style.profile_file) : null;
  if (profilePath && !existsSync(profilePath)) {
    throw new Error(`Style ${style.id} is missing profile file: ${profilePath}`);
  }
  const prompt = profilePath ? readFileSync(profilePath, 'utf8').trim() : style.prompt_blocks.join('\n');
  const references = (style.reference_images || []).map((reference) => ({
    ...reference,
    absolute_path: resolve(root, reference.path),
  }));
  const missingReferences = references
    .filter((reference) => !existsSync(reference.absolute_path))
    .map((reference) => reference.absolute_path);
  if (missingReferences.length > 0) {
    throw new Error(`Style ${style.id} is missing reference images:\n${missingReferences.join('\n')}`);
  }

  return {
    ...style,
    prompt,
    references,
    library_version: library.catalog.version,
    is_default: style.id === library.catalog.default_style,
  };
};
