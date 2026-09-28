// The question set sent to Jev for every post. This is the main tuning lever:
// iterate on wording here and re-run `npm run eval`.
// Keep criteria short — question definitions dominate input tokens (= cost).
//
// Two independent axes decide the badge:
//   value  — what a reader gets from the post        → useful or not
//   bait   — whether it's built to extract engagement → bait or not
// Everything else (formula writing, AI style) is explanation only.

import type { ChoiceQuestion, NoulQuestion, Question, ScoreQuestion } from './jev';

// Bump whenever question wording changes, so cached answers from the old
// wording are ignored.
export const QUESTIONS_VERSION = 7;

export type Platform = 'linkedin' | 'x';

export type PostState = {
  platform: Platform;
  kind: 'post';
  text: string;
};

// ── Axis 1: value ────────────────────────────────────────────────────────────

// Judge the takeaway, not the telling: story details ("a shared room with 6
// people") look concrete but aren't information a reader can use, and a moral
// drawn from a story is a platitude, not an idea.
export const VALUE_LEVELS = [
  'Nothing to take away',
  'A platitude or feel-good moral, even when told through a story or anecdote',
  'A non-obvious idea or argument the reader could apply or debate',
  'Concrete information the reader can act on: steps, data, tools, news, or a resource',
];

/** Short names for VALUE_LEVELS, for display. */
export const VALUE_LEVEL_NAMES = ['Nothing', 'Platitude / moral', 'Idea', 'Actionable info'];

/** Levels at or above this count as "useful" when computing P(useful). */
export const USEFUL_LEVEL = 2;
/** The level formula-written posts must reach to count as useful (see score.ts). */
export const ACTIONABLE_LEVEL = 3;

const VALUE_QUESTION: ScoreQuestion = {
  type: 'score',
  instructions:
    'What can a reader actually use or learn from this post, judged only by the text? Would they know or be able to do something new? Story details and a moral do not count as usable information, and a promise of value elsewhere does not count.',
  criteria: VALUE_LEVELS,
};

// ── Axis 2: bait ─────────────────────────────────────────────────────────────

export const INTENTS = {
  inform: { label: 'Inform', criterion: 'Share information, a how-to, news, or a resource' },
  opinion: { label: 'Opinion', criterion: 'Share an opinion, take, or reaction' },
  personal: { label: 'Personal update', criterion: 'Share personal news, a milestone, or a story from their life' },
  discussion: { label: 'Discussion', criterion: 'Ask a genuine question or start a real discussion' },
  entertain: { label: 'Entertain', criterion: 'A joke, meme, or entertainment' },
  promote: { label: 'Promote', criterion: 'Promote a product, job, event, or service' },
  farm_engagement: { label: 'Farm engagement', criterion: 'Mainly to collect likes, comments, reposts, or follows' },
  provoke: { label: 'Provoke', criterion: 'Deliberately divisive, to trigger angry replies' },
} as const;

export type IntentKey = keyof typeof INTENTS;
export const INTENT_KEYS = Object.keys(INTENTS) as IntentKey[];
/** Intents whose probability adds up to P(bait intent). */
export const BAIT_INTENTS: IntentKey[] = ['farm_engagement', 'provoke'];

const INTENT_QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions: 'What is this post mainly trying to do?',
  criteria: Object.fromEntries(INTENT_KEYS.map((k) => [k, INTENTS[k].criterion])),
};

// Named bait tactics. A bait verdict always needs at least one of these, so the
// badge can always say *how* a post is baiting.
export const BAIT_TACTICS = {
  gated_value: {
    label: 'Gated value',
    question: {
      type: 'noul',
      instructions:
        'Does the post hold back its value until the reader engages (e.g. "Comment X and I\'ll send it", "DM me for the guide", "Follow to get it")?',
      criteria: {
        true: 'The value is gated behind a comment, DM, follow, or repost.',
        false: 'Whatever it offers is in the post or freely linked.',
      },
    },
  },
  unpaid_hook: {
    label: 'Hook without payoff',
    question: {
      type: 'noul',
      instructions:
        'Does the opening promise something (a secret, a lesson, a list, a story) that the post itself never actually delivers?',
      criteria: {
        true: "The hook's promise goes unpaid in the text.",
        false: 'The post delivers what it opens with, or makes no such promise.',
      },
    },
  },
  engagement_ask: {
    label: 'Asks for engagement',
    question: {
      type: 'noul',
      instructions:
        'Does it explicitly ask for engagement ("Agree?", "Thoughts?", "Repost if…", "Tag someone who…", "Save this", "Follow for more")?',
      criteria: {
        true: 'An explicit call for likes, comments, reposts, tags, saves, or follows.',
        false: 'No such ask beyond a natural question.',
      },
    },
  },
  rage_bait: {
    label: 'Rage bait',
    question: {
      type: 'noul',
      instructions: 'Is it deliberately inflammatory or divisive in order to provoke replies, rather than sincerely expressing a view?',
      criteria: {
        true: 'Written to provoke outrage or pile-ons.',
        false: 'Sincere, even if angry or strongly opinionated.',
      },
    },
  },
  unverifiable_flex: {
    label: 'Unverifiable flex',
    question: {
      type: 'noul',
      instructions:
        'Does it lean on impressive but unverifiable claims (income, growth, followers, number of rejections) to grab attention?',
      criteria: {
        true: 'Attention-grabbing claims with nothing to back them up.',
        false: 'No such claims, or they are specific and checkable.',
      },
    },
  },
  staged_story: {
    label: 'Staged story',
    question: {
      type: 'noul',
      instructions:
        'Is it a too-neat viral anecdote (quoted dialogue, a dramatic turn like "That hit hard", a tidy moral in one-liners) told to go viral rather than to inform?',
      criteria: {
        true: 'A staged, feel-good or outrage story engineered around a moral.',
        false: 'No such story, or a messy, specific account told for its own sake.',
      },
    },
  },
  link_in_comments: {
    label: 'Link in comments',
    question: {
      type: 'noul',
      instructions: 'Does it send readers to the comments for the link or for the rest of the content?',
      criteria: {
        true: 'Points readers to the comments to get the link or content.',
        false: 'No such redirection.',
      },
    },
  },
} as const satisfies Record<string, { label: string; question: NoulQuestion }>;

export type TacticKey = keyof typeof BAIT_TACTICS;
export const TACTIC_KEYS = Object.keys(BAIT_TACTICS) as TacticKey[];

// ── Explanation only ─────────────────────────────────────────────────────────

// Formula writing (broetry, hook → lesson → CTA) can still be useful, so it's
// shown as context and never decides the badge.
const FORMULA_QUESTION: NoulQuestion = {
  type: 'noul',
  instructions:
    'Is it written as a reusable engagement formula (hook → lesson or list → call to action, dramatic one-line paragraphs, stock phrases)?',
  criteria: {
    true: 'Follows a recognizable engagement formula.',
    false: "Written in the author's own way.",
  },
};

// AI-authorship judgments are unreliable (edited AI text passes as human;
// non-native writers get misflagged), so this is shown on its own line only.
const AI_STYLE_QUESTION: NoulQuestion = {
  type: 'noul',
  instructions: 'Does this text read as generated by an AI assistant (ChatGPT-style prose) rather than written by a person?',
  criteria: {
    true: 'Reads like AI output: uniformly polished, even rhythm, stock transitions, balanced lists, tidy summarizing close.',
    false: 'Reads like a person: uneven rhythm, idiosyncratic word choice, slang or typos, specific personal detail.',
  },
};

export type QuestionKey = 'value' | 'intent' | 'formula' | 'ai_style' | TacticKey;

export function buildQuestions(): Record<QuestionKey, Question> {
  const questions = {
    value: VALUE_QUESTION,
    intent: INTENT_QUESTION,
    formula: FORMULA_QUESTION,
    ai_style: AI_STYLE_QUESTION,
  } as Record<QuestionKey, Question>;
  for (const key of TACTIC_KEYS) questions[key] = BAIT_TACTICS[key].question;
  return questions;
}
