export type Template = 'twist' | 'punchline' | 'baddraw';

export const SCHEMA_VERSION = '1.0';

/**
 * Creator-authored input, parsed from `short-script.yaml`.
 * See docs/schema.md §1 for field semantics.
 */
export interface ShortScript {
  schema_version: typeof SCHEMA_VERSION;
  template: Template;
  title: string;
  duration_sec?: 15 | 21 | 30;
  style?: string;
  character_lock?: string;
  sfx?: boolean;
  credit_to?: string | null;

  hook: string;
  visual: string;
  punchline: string;
  /** Twist-only: overrides `visual` for the reveal phase. */
  reveal_visual?: string;
}

export interface ShortboardBeats {
  hook_end_sec: number;
  draw_start_sec: number;
  color_complete_sec: number;
  punchline_start_sec: number;
}

export interface ShortboardProject {
  title: string;
  template: Template;
  width: 1080;
  height: 1440;
  fps: 30;
  duration_sec: number;
  style_id: string;
  style_fingerprint: string;
  character_lock: string | null;
  character_reference_id: string | null;
  sfx: boolean;
  beats: ShortboardBeats;
}

export interface ShortboardSceneAssets {
  bw: string | null;
  color: string | null;
}

export interface ShortboardScene {
  id: string;
  hook_text: string;
  punchline_text: string;
  visual: string;
  credit_to: string | null;
  layers: string[];
  assets: ShortboardSceneAssets;
}

/**
 * Internal artifact produced by `plan-short` (Phase 1), consumed by the
 * Remotion renderer. See docs/schema.md §2.
 */
export interface Shortboard {
  schema_version: typeof SCHEMA_VERSION;
  project: ShortboardProject;
  scene: ShortboardScene;
}

export interface PerformanceData {
  published: boolean;
  platform: string | null;
  published_at: string | null;
  views: number | null;
  completion_rate_3s: number | null;
  completion_rate_full: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  cover_ctr: number | null;
}

/**
 * Published asset-package sidecar, written next to video.mp4/cover.png.
 * See docs/schema.md §3.
 */
export interface MetaJson {
  schema_version: typeof SCHEMA_VERSION;
  title_candidates: string[];
  hashtags: string[];
  template: Template;
  duration_sec: number;
  style_id: string;
  character_lock: string | null;
  hook: string;
  punchline: string;
  credit_to: string | null;
  beats: Pick<ShortboardBeats, 'hook_end_sec' | 'color_complete_sec'>;
  performance: PerformanceData;
}

export interface CharacterReferenceFrame {
  style_id: string;
  frame_path: string;
}

/**
 * character_lock reuse store at styles/characters/<lock_hash>/reference.json.
 * See docs/schema.md §4.
 */
export interface CharacterReference {
  lock_hash: string;
  character_lock_text: string;
  created_at: string;
  reference_frames: CharacterReferenceFrame[];
  usage_count: number;
}

export interface TemplateConfig {
  template: Template;
  duration_sec: 15 | 21 | 30;
  ratio: number;
  style_suggestions: string[];
  /** If set, this style_id is forced regardless of user input (BadDraw). */
  style_lock: string | null;
}
