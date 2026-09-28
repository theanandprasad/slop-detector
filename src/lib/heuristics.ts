// Free, instant local checks, in four groups:
//   bait    — phrases that are named evidence for a bait tactic (count toward "bait")
//   value   — clues that the post carries usable information (can tip a borderline
//             post into "useful")
//   formula — formula-writing tells (explanation only)
//   ai      — assistant-style phrasing (explanation only, shown on the AI line)
// Each check is tuned to fire on deliberate moves, not ordinary writing: e.g. a
// question counts as an ask only as the closing line, buzzwords only in pairs.

import type { TacticKey } from './questions';

export type BaitHit = { label: string; tactic: TacticKey };

export type LocalChecks = {
  bait: BaitHit[];
  value: string[];
  formula: string[];
  ai: string[];
};

// ── Bait phrases → the tactic they're evidence for ──────────────────────────

const BAIT_PHRASES: [RegExp, string, TacticKey][] = [
  [/\bcomment ["“'‘]?\w+["”'’]? (?:below )?(?:and|&|to get|for)\b/i, 'Comment "X" to get it', 'gated_value'],
  [/\b(?:dm|message) me (?:for|to get|and I'?ll)\b/i, '"DM me for…"', 'gated_value'],
  [/\blink (?:is )?in (?:the )?(?:first )?comments?\b/i, '"Link in comments"', 'link_in_comments'],
  [/♻️|\brepost (?:if|to|this)\b/i, 'Repost ask', 'engagement_ask'],
  [/\btag (?:someone|a friend|a person) (?:who|that)\b/i, '"Tag someone who…"', 'engagement_ask'],
  [/\bsave this (?:post|for later)\b|🔖/i, '"Save this post"', 'engagement_ask'],
  [/\bfollow (?:me )?for more\b/i, '"Follow for more"', 'engagement_ask'],
  [/\bthat (?:really )?hit (?:me )?(?:hard|different)\b/i, '"That hit hard"', 'staged_story'],
  [/\bI was (?:speechless|stunned|left speechless)\b/i, '"I was speechless"', 'staged_story'],
  [/\bchanged my (?:perspective|mindset|life) forever\b/i, '"Changed my perspective forever"', 'staged_story'],
  [/\bI'?ll never forget (?:what|his|her|their|the)\b/i, '"I\'ll never forget…"', 'staged_story'],
  [/\bthat'?s when (?:it hit me|I realized)\b/i, '"That\'s when it hit me"', 'staged_story'],
  [/\bmoral of the story\b/i, '"Moral of the story"', 'staged_story'],
];

// A closing question on its own line ("Agree?", "Thoughts? 👇"). Mid-post questions are fine.
const ASK_CLOSER =
  /^(?:agree|thoughts|what do you think|am i wrong|what would you add|who else)\??[\s\p{Extended_Pictographic}️]*$/iu;

// ── Value clues ─────────────────────────────────────────────────────────────

const MEASUREMENT =
  /(?:[$₹€£]\s?\d[\d,.]*\s?[kmb]?\b|\b\d[\d,.]*\s?(?:%|ms\b|x\b|k\b|gb\b|mb\b|tb\b|hrs?\b|hours\b|minutes\b|mins\b|days\b|weeks\b|months\b|users\b|customers\b|requests\b|rows\b|km\b|kg\b))/gi;
const EXTERNAL_LINK = /\bhttps?:\/\/(?!(?:www\.)?(?:linkedin\.com|lnkd\.in|x\.com|twitter\.com|t\.co)\b)\S+|\b[a-z0-9-]+\.(?:com|io|ai|dev|org|co|app|net)\b/i;
const CODE = /`[^`\n]+`|```|\b[a-z_]\w*\([^)]*\)|\b\w+\.\w+\(/i;

// ── Formula tells ───────────────────────────────────────────────────────────

const FORMULA_PHRASES: [RegExp, string][] = [
  [/\blet that sink in\b/i, '"Let that sink in"'],
  [/\bread that again\b/i, '"Read that again"'],
  [/^\s*here'?s the thing\b/im, '"Here\'s the thing" opener'],
  [/\bnobody (?:talks|is talking) about\b/i, '"Nobody talks about"'],
  [/\bit'?s not (?:just )?(?:about )?[^.!?\n]{1,40}[.,—–-]\s*it'?s\b/i, '"It\'s not X, it\'s Y"'],
];
// One of these is ordinary word choice; two or more is a voice.
const BUZZWORDS =
  /\b(?:delve|tapestry|game[- ]changer|in today'?s (?:fast[- ]paced|digital|ever[- ]changing)|unlock(?:ing)? (?:your|the) (?:potential|power)|leverage|synergy|thought leader)\b/gi;
// Real emoji bullets only; plain •, ▪, → bullets are ordinary list formatting.
const EMOJI_BULLET = /^\s*\p{Extended_Pictographic}️?\s+\S/u;

// ── AI-style phrasing ───────────────────────────────────────────────────────

const AI_PHRASES: [RegExp, string][] = [
  [/\bhere'?s (?:why|how|what)\b[^.\n]{0,40}:/i, '"Here\'s why/how:" lead-in'],
  [/\blet'?s (?:dive in|dive into|unpack|break (?:it|this|that) down)\b/i, '"Let\'s dive in / unpack"'],
  [/\b(?:in conclusion|in summary|to sum up|ultimately),/i, 'Summarizing close'],
];
const AI_VOCAB =
  /\b(?:testament to|underscores?|pivotal|seamless(?:ly)?|foster(?:s|ing)?|realm|intricate|multifaceted|navigat(?:e|ing) the (?:complexities|landscape)|ever-evolving|elevate)\b/gi;
const EMOJI_HEADER = /^\p{Extended_Pictographic}️?\s*[^\n]{1,40}:\s*$/gmu;

export function runLocalChecks(text: string): LocalChecks {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;

  // Bait
  const bait: BaitHit[] = [];
  for (const [re, label, tactic] of BAIT_PHRASES) {
    if (re.test(text)) bait.push({ label, tactic });
  }
  const last = lines.at(-1);
  if (last && lines.length >= 2 && ASK_CLOSER.test(last)) {
    bait.push({ label: `Closing "${last.replace(/[^\p{L}\p{N}?' ]/gu, '').trim()}"`, tactic: 'engagement_ask' });
  }

  // Value
  const value: string[] = [];
  const measurements = text.match(MEASUREMENT)?.length ?? 0;
  if (measurements >= 2) value.push(`${measurements} numbers with units`);
  if (EXTERNAL_LINK.test(text)) value.push('Links to an outside source');
  if (CODE.test(text)) value.push('Contains code');

  // Formula
  const formula: string[] = [];
  for (const [re, label] of FORMULA_PHRASES) {
    if (re.test(text)) formula.push(label);
  }
  const buzz = new Set(text.match(BUZZWORDS)?.map((w) => w.toLowerCase()));
  if (buzz.size >= 2) formula.push(`Buzzwords: ${[...buzz].slice(0, 3).join(', ')}`);
  const emojiBullets = lines.filter((l) => EMOJI_BULLET.test(l)).length;
  if (emojiBullets >= 3) formula.push(`${emojiBullets} emoji bullets`);
  const short = lines.filter((l) => l.split(/\s+/).length <= 10).length;
  if (lines.length >= 8 && short / lines.length >= 0.8) formula.push('One-line paragraphs');
  const hashtags = text.match(/(?:^|\s)#\w+/g)?.length ?? 0;
  if (hashtags >= 5) formula.push(`${hashtags} hashtags`);

  // AI style
  const ai: string[] = [];
  for (const [re, label] of AI_PHRASES) {
    if (re.test(text)) ai.push(label);
  }
  const vocab = new Set(text.match(AI_VOCAB)?.map((w) => w.toLowerCase()));
  if (vocab.size >= 2) ai.push(`AI vocabulary: ${[...vocab].slice(0, 4).join(', ')}`);
  const emDashes = text.match(/—/g)?.length ?? 0;
  if (emDashes >= 3 && emDashes / Math.max(words, 1) >= 1 / 80) ai.push(`${emDashes} em-dashes`);
  const headers = text.match(EMOJI_HEADER)?.length ?? 0;
  if (headers >= 2) ai.push(`${headers} emoji section headers`);

  return { bait, value, formula, ai };
}
