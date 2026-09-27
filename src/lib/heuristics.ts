// Free, instant local signals. They don't move the score; they count as
// corroborating evidence for a colored badge and show up in the explanation.
// Each check is tuned to fire on formula moves, not on ordinary writing: e.g. a
// question counts as bait only as the closing line, buzzwords only in pairs.

import type { TellKey } from './questions';

// Each phrase maps to the Jev pattern it's evidence for (if any), so a phrase and
// its matching Jev pattern count as one signal, not two.
const STOCK_PHRASES: [RegExp, string, TellKey][] = [
  [/\blet that sink in\b/i, '"Let that sink in"', 'hook_formula'],
  [/\bread that again\b/i, '"Read that again"', 'hook_formula'],
  // Only as a line opener; mid-sentence it's ordinary conversation.
  [/^\s*here'?s the thing\b/im, '"Here\'s the thing" opener', 'hook_formula'],
  [/\bnobody (?:talks|is talking) about\b/i, '"Nobody talks about"', 'hook_formula'],
  [/♻️|\brepost (?:if|to|this)\b/i, 'Repost bait', 'engagement_bait'],
  [/\bcomment ["“]?\w+["”]? (?:below )?(?:and|&) I'?ll\b/i, '"Comment X and I\'ll…"', 'engagement_bait'],
  [/\bfollow (?:me )?for more\b/i, '"Follow for more"', 'engagement_bait'],
  [/\bit'?s not (?:just )?(?:about )?[^.!?\n]{1,40}[.,—–-]\s*it'?s\b/i, '"It\'s not X, it\'s Y"', 'contrast_framing'],
];

// A closing question on its own line ("Agree?", "Thoughts? 👇"). Mid-post questions are fine.
const BAIT_CLOSER = /^(?:agree|thoughts|what do you think|am i wrong|what would you add|who else)\??[\s\p{Extended_Pictographic}\uFE0F]*$/iu;

// One of these is ordinary word choice; two or more is a voice.
const BUZZWORDS = /\b(?:delve|tapestry|game[- ]changer|in today'?s (?:fast[- ]paced|digital|ever[- ]changing)|unlock(?:ing)? (?:your|the) (?:potential|power)|leverage|synergy|thought leader)\b/gi;

// Real emoji bullets only; plain •, ▪, → bullets are ordinary list formatting.
const EMOJI_BULLET = /^\s*\p{Extended_Pictographic}\uFE0F?\s+\S/u;

/** `counted: false` hits are shown as context but don't count toward the signal requirement. */
export type HeuristicHit = { label: string; tell?: TellKey; counted?: boolean };

export type HeuristicResult = {
  hits: HeuristicHit[];
};

export function runHeuristics(text: string): HeuristicResult {
  const hits: HeuristicHit[] = [];

  for (const [re, label, tell] of STOCK_PHRASES) {
    if (re.test(text)) hits.push({ label, tell });
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines.at(-1);
  if (last && lines.length >= 2 && BAIT_CLOSER.test(last)) {
    hits.push({ label: `Closing "${last.replace(/[^\p{L}\p{N}?' ]/gu, '').trim()}"`, tell: 'engagement_bait' });
  }

  const buzz = new Set(text.match(BUZZWORDS)?.map((w) => w.toLowerCase()));
  if (buzz.size >= 2) hits.push({ label: `Buzzwords: ${[...buzz].slice(0, 3).join(', ')}`, tell: 'buzzword_voice' });

  const emojiBullets = lines.filter((l) => EMOJI_BULLET.test(l)).length;
  if (emojiBullets >= 3) hits.push({ label: `${emojiBullets} emoji bullets`, tell: 'broetry' });

  // Broetry: a long run of very short standalone lines.
  const short = lines.filter((l) => l.split(/\s+/).length <= 10).length;
  if (lines.length >= 8 && short / lines.length >= 0.8) hits.push({ label: 'One-line paragraphs', tell: 'broetry' });

  // Context only: common on LinkedIn and in real X threads, not a formula by themselves.
  const hashtags = text.match(/(?:^|\s)#\w+/g)?.length ?? 0;
  if (hashtags >= 5) hits.push({ label: `${hashtags} hashtags`, counted: false });
  if (/🧵/u.test(text)) hits.push({ label: 'Thread emoji', counted: false });

  return { hits };
}

// AI-style checks: phrasing typical of assistant-generated text. Shown alongside the
// separate "Reads AI-written" line; they never count as slop signals.
const AI_PHRASES: [RegExp, string][] = [
  [/\bhere'?s (?:why|how|what)\b[^.\n]{0,40}:/i, '"Here\'s why/how:" lead-in'],
  [/\blet'?s (?:dive in|dive into|unpack|break (?:it|this|that) down)\b/i, '"Let\'s dive in / unpack"'],
  [/\b(?:in conclusion|in summary|to sum up|ultimately),/i, 'Summarizing close'],
];

const AI_VOCAB = /\b(?:testament to|underscores?|pivotal|seamless(?:ly)?|foster(?:s|ing)?|realm|intricate|multifaceted|navigat(?:e|ing) the (?:complexities|landscape)|ever-evolving|elevate)\b/gi;

const EMOJI_HEADER = /^\p{Extended_Pictographic}\uFE0F?\s*[^\n]{1,40}:\s*$/gmu;

export function runAiHeuristics(text: string): string[] {
  const hits: string[] = [];

  for (const [re, label] of AI_PHRASES) {
    if (re.test(text)) hits.push(label);
  }

  const vocab = new Set(text.match(AI_VOCAB)?.map((w) => w.toLowerCase()));
  if (vocab.size >= 2) hits.push(`AI vocabulary: ${[...vocab].slice(0, 4).join(', ')}`);

  const words = text.split(/\s+/).filter(Boolean).length;
  const emDashes = text.match(/—/g)?.length ?? 0;
  if (emDashes >= 3 && emDashes / Math.max(words, 1) >= 1 / 80) hits.push(`${emDashes} em-dashes`);

  const headers = text.match(EMOJI_HEADER)?.length ?? 0;
  if (headers >= 2) hits.push(`${headers} emoji section headers`);

  return hits;
}
