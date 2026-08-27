// Title/hashtag generation (PRD §4.5) — a rule engine, not an LLM call:
// 1. hook as-is
// 2. hook + a reveal/turn phrase (varies by template)
// 3. hook rephrased as a question

import { readFileSync } from 'node:fs';

const TEMPLATE_TAG = {
  twist: '反转',
  punchline: '金句',
  baddraw: '烂画',
};

const TURN_PHRASE = {
  twist: '，结果……',
  punchline: '，其实……',
  baddraw: '，结果……',
};

function stripTrailingPunctuation(text) {
  return text.replace(/[。！？，、]+$/u, '');
}

export function generateTitlesAndTags(shortboard) {
  const hook = shortboard.scene.hook_text;
  const template = shortboard.project.template;
  const bare = stripTrailingPunctuation(hook);

  const titleCandidates = [
    hook,
    `${bare}${TURN_PHRASE[template] ?? '，结果……'}`,
    `为什么${bare}？`,
  ];

  const hashtags = ['纸上瘾', '手绘', TEMPLATE_TAG[template] ?? template];

  return { title_candidates: titleCandidates, hashtags };
}

function main() {
  const shortboardPath = process.argv[2];
  if (!shortboardPath) {
    console.error('usage: generate-titles.mjs <shortboard.json>');
    process.exit(1);
  }
  const shortboard = JSON.parse(readFileSync(shortboardPath, 'utf8'));
  console.log(JSON.stringify(generateTitlesAndTags(shortboard), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
