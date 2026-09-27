// The question set sent to Jev for every post. This is the main tuning lever:
// iterate on wording here and re-run `npm run eval`.
// Keep criteria short — question definitions dominate input tokens (= cost).

import type { NoulQuestion, ScoreQuestion } from './jev';

// Bump whenever question wording changes, so cached verdicts from the old
// wording are ignored.
export const QUESTIONS_VERSION = 5;

// "Slop" = a reusable engagement formula. Casual, crude, or angry posts are
// genuine voice, not slop, so the levels spell out what a formula looks like.
// Level 1 deliberately absorbs "generic but not a formula" posts (aphorisms,
// familiar sentiments, polished announcements) so they don't get pushed to 2.
export const SLOP_LEVELS = [
  "Own voice: specific, personal, casual, opinionated, or ranting; not a reusable formula",
  'Own voice but generic: a familiar sentiment, aphorism, or announcement, or a few stock phrases; no clear formula',
  'Clearly follows a reusable engagement formula (hook → lesson/list → call to action); swap the topic and the post still works',
  'Pure formula: empty, interchangeable engagement farming with nothing specific',
];

/** Short names for SLOP_LEVELS, for display. */
export const SLOP_LEVEL_NAMES = ['Genuine', 'Mostly genuine', 'Template', 'Pure slop'];

/** Levels at or above this count as "templated" when computing P(slop). */
export const TEMPLATE_LEVEL = 2;

export const TELLS = {
  no_specifics: {
    label: 'No concrete specifics',
    // Shown as context but not counted as a signal: it fires on nearly every
    // aphorism, opinion, or joke, so it can't tell slop from non-slop.
    countsAsSignal: false,
    question: {
      type: 'noul',
      instructions: 'Does the post make broad claims or lessons without concrete names, numbers, places, or verifiable details?',
      criteria: {
        true: 'Generic and abstract; could have been written by anyone about anything.',
        false: 'Grounded in specific, concrete details only this author would know.',
      },
    },
  },
  engagement_bait: {
    label: 'Engagement bait',
    question: {
      type: 'noul',
      instructions: 'Does the post fish for engagement (e.g. "Agree?", "Thoughts?", "Repost if…", "Comment X and I\'ll send…", "Follow for more")?',
      criteria: {
        true: 'Contains an explicit call for likes, comments, reposts, or follows.',
        false: 'No engagement solicitation beyond a natural question.',
      },
    },
  },
  contrast_framing: {
    label: '"It\'s not X, it\'s Y" framing',
    question: {
      type: 'noul',
      instructions: 'Does the post lean on formulaic reversals like "It\'s not X. It\'s Y." or "X isn\'t about A, it\'s about B"?',
      criteria: {
        true: 'Uses this reversal pattern as a rhetorical crutch.',
        false: 'Does not rely on this pattern.',
      },
    },
  },
  manufactured_story: {
    label: 'Templated story arc',
    question: {
      type: 'noul',
      instructions: 'Is this a templated story arc (setback or humble moment → epiphany → neat life/business lesson)?',
      criteria: {
        true: 'Follows the setback-to-lesson template, often feeling staged.',
        false: 'No such arc, or the story is messy and genuinely particular.',
      },
    },
  },
  broetry: {
    label: 'Broetry formatting',
    question: {
      type: 'noul',
      instructions: 'Is the post formatted as dramatic one-line paragraphs or stacked emoji bullets for effect?',
      criteria: {
        true: 'Short dramatic lines or emoji-bullet lists used for effect.',
        false: 'Normal paragraphs or ordinary formatting.',
      },
    },
  },
  buzzword_voice: {
    label: 'Stock AI/corporate vocabulary',
    question: {
      type: 'noul',
      instructions: 'Is the post heavy on stock vocabulary (delve, landscape, game-changer, unlock, leverage, navigate, journey, in today\'s fast-paced world)?',
      criteria: {
        true: 'Relies on this stock vocabulary.',
        false: 'Plain or distinctive word choice.',
      },
    },
  },
  hook_formula: {
    label: 'Formula hook',
    question: {
      type: 'noul',
      instructions: 'Does it open with a formula hook ("Here\'s the thing", "Let that sink in", "Nobody talks about this", "I was fired. Best thing that ever happened.")?',
      criteria: {
        true: 'Opens with a recognizable scroll-stopping formula.',
        false: 'Opens naturally.',
      },
    },
  },
} as const satisfies Record<string, { label: string; question: NoulQuestion; countsAsSignal?: boolean }>;

export type TellKey = keyof typeof TELLS;

export const TELL_KEYS = Object.keys(TELLS) as TellKey[];

// Separate from the slop verdict on purpose: AI-authorship judgments are unreliable
// (edited AI text passes as human; non-native writers get misflagged), so this is
// shown as its own line and never affects the tier or counts as a signal.
export const AI_STYLE_QUESTION: NoulQuestion = {
  type: 'noul',
  instructions: 'Does this text read as generated by an AI assistant (ChatGPT-style prose) rather than written by a person?',
  criteria: {
    true: 'Reads like AI output: uniformly polished, even rhythm, stock transitions, balanced lists, tidy summarizing close.',
    false: 'Reads like a person: uneven rhythm, idiosyncratic word choice, slang or typos, specific personal detail.',
  },
};

export type SlopQuestionKey = 'slop' | 'ai_style' | TellKey;

export function buildQuestions(): Record<SlopQuestionKey, NoulQuestion | ScoreQuestion> {
  const questions = {
    slop: {
      type: 'score',
      instructions: 'Is this post built from a reusable engagement formula, or written in the author\'s own voice? Strong opinions, rants, jokes and reactions are own voice, not formulas. A generic or familiar idea is not a formula by itself.',
      criteria: SLOP_LEVELS,
    },
    ai_style: AI_STYLE_QUESTION,
  } as Record<SlopQuestionKey, NoulQuestion | ScoreQuestion>;
  for (const key of TELL_KEYS) questions[key] = TELLS[key].question;
  return questions;
}

export type PostState = {
  platform: 'linkedin' | 'x';
  kind: 'post';
  text: string;
};
