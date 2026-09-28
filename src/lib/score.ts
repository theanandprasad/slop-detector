// Turns Jev's answers + local checks into one of four categories:
//
//                 not bait     bait
//   useful        useful       baity   ("useful, but baity")
//   not useful    casual       bait
//
// Thresholds are defaults; they're re-fitted to the user's own feedback once
// there's enough of it (see calibrate.ts).

import type { LocalChecks } from './heuristics';
import type { Answer, DecisionsResponse } from './jev';
import {
  ACTIONABLE_LEVEL,
  BAIT_INTENTS,
  BAIT_TACTICS,
  INTENT_KEYS,
  INTENTS,
  TACTIC_KEYS,
  USEFUL_LEVEL,
  VALUE_LEVELS,
  type IntentKey,
  type QuestionKey,
  type TacticKey,
} from './questions';

export type Category = 'useful' | 'casual' | 'baity' | 'bait';
export const CATEGORIES: Category[] = ['useful', 'casual', 'baity', 'bait'];

export type Thresholds = {
  /** Minimum P(value level ≥ USEFUL_LEVEL) for "useful". */
  useful: number;
  /** Minimum P(bait intent) for a single tactic to make a post bait. */
  baitIntent: number;
};
export const DEFAULT_THRESHOLDS: Thresholds = { useful: 0.5, baitIntent: 0.5 };

/** A Jev yes/no answer counts as "yes" at this probability. */
export const NOUL_THRESHOLD = 0.6;
/** Two or more distinct tactics make a post bait regardless of intent. */
const TACTICS_FOR_BAIT = 2;
/** A post this close below the useful threshold is tipped over by ≥ 2 value clues. */
const VALUE_CLUE_WINDOW = 0.15;
/**
 * When Jev is this sure a post is written as an engagement formula (broetry,
 * hook → story → moral), an "idea" isn't enough: only actionable info counts as
 * useful. Formula writing still never makes a post bait on its own.
 */
export const FORMULA_STRICT = 0.8;

export type FiredTactic = {
  key: TacticKey;
  label: string;
  /** Jev's probability, or null if only a local phrase matched. */
  p: number | null;
  phrases: string[];
};

export type Verdict = {
  category: Category;
  /** What the model said, before any user label. */
  predicted: Category;
  /** The user's own label for this post, if they gave one (it wins over `predicted`). */
  userLabel: Category | null;
  /** True when the user's label differs from what the model said. */
  overridden: boolean;

  /** P(value level ≥ usefulFrom). */
  pUseful: number;
  /** Lowest value level that counts as useful: USEFUL_LEVEL, or ACTIONABLE_LEVEL for formula posts. */
  usefulFrom: number;
  /** Jev's probability for each value level (index = level). */
  valueLevels: number[];
  valueClues: string[];

  /** Jev's intent distribution, most likely first. */
  intents: { key: IntentKey; label: string; p: number }[];
  /** P(farm engagement) + P(provoke). */
  pBaitIntent: number;
  tactics: FiredTactic[];

  /** Formula writing: explanation only. */
  formula: { p: number | null; hits: string[] };
  /** AI-style read: explanation only. */
  ai: { p: number | null; hits: string[] };

  partial: boolean;
  cost: number;
  model: string;
};

export type JevAnswers = DecisionsResponse<QuestionKey>;

function distribution(answer: Answer | undefined, keys: string[]): number[] {
  if (!answer || answer.type === 'noul') return keys.map(() => 0);
  const probs = keys.map((k) => answer.probabilities?.[k] ?? 0);
  if (probs.some((p) => p > 0)) return probs;
  // No distribution returned: put all the mass on the answer itself.
  const idx = answer.type === 'score' ? Math.round(answer.score) : keys.indexOf(answer.choice);
  return keys.map((_, i) => (i === Math.min(keys.length - 1, Math.max(0, idx)) ? 1 : 0));
}

function noul(answer: Answer | undefined): number | null {
  return answer?.type === 'noul' ? answer.noul : null;
}

export function categorize(useful: boolean, bait: boolean): Category {
  if (useful) return bait ? 'baity' : 'useful';
  return bait ? 'bait' : 'casual';
}

export function combine(
  res: JevAnswers,
  local: LocalChecks,
  opts: { partial?: boolean; thresholds?: Thresholds } = {},
): Verdict {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const a = res.answers;

  // Value axis
  const valueLevels = distribution(a.value, VALUE_LEVELS.map((_, i) => String(i)));
  const formulaP = noul(a.formula);
  const usefulFrom = formulaP !== null && formulaP >= FORMULA_STRICT ? ACTIONABLE_LEVEL : USEFUL_LEVEL;
  const pUseful = Math.min(1, valueLevels.slice(usefulFrom).reduce((s, p) => s + p, 0));
  const useful =
    pUseful >= t.useful || (pUseful >= t.useful - VALUE_CLUE_WINDOW && local.value.length >= 2);

  // Bait axis
  const intentProbs = distribution(a.intent, INTENT_KEYS);
  const intents = INTENT_KEYS.map((key, i) => ({ key, label: INTENTS[key].label, p: intentProbs[i] ?? 0 })).sort(
    (x, y) => y.p - x.p,
  );
  const pBaitIntent = Math.min(1, intents.filter((i) => BAIT_INTENTS.includes(i.key)).reduce((s, i) => s + i.p, 0));

  // A tactic fires if Jev says yes or a local phrase matched; the two count once.
  const tactics: FiredTactic[] = [];
  for (const key of TACTIC_KEYS) {
    const p = noul(a[key]);
    const phrases = local.bait.filter((h) => h.tactic === key).map((h) => h.label);
    if ((p !== null && p >= NOUL_THRESHOLD) || phrases.length) {
      tactics.push({ key, label: BAIT_TACTICS[key].label, p, phrases });
    }
  }
  tactics.sort((x, y) => (y.p ?? 0) - (x.p ?? 0));
  const bait = tactics.length >= TACTICS_FOR_BAIT || (tactics.length >= 1 && pBaitIntent >= t.baitIntent);

  const category = categorize(useful, bait);
  return {
    category,
    predicted: category,
    userLabel: null,
    overridden: false,
    pUseful,
    usefulFrom,
    valueLevels,
    valueClues: local.value,
    intents,
    pBaitIntent,
    tactics,
    formula: { p: formulaP, hits: local.formula },
    ai: { p: noul(a.ai_style), hits: local.ai },
    partial: opts.partial ?? false,
    cost: res.usage?.cost ?? 0,
    model: res.model,
  };
}

export function applyUserLabel(v: Verdict, label: Category): Verdict {
  return { ...v, category: label, userLabel: label, overridden: label !== v.predicted };
}
