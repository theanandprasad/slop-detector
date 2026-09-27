import type { HeuristicHit } from './heuristics';
import type { Answer, DecisionsResponse } from './jev';
import { SLOP_LEVELS, TELL_KEYS, TELLS, TEMPLATE_LEVEL, type SlopQuestionKey, type TellKey } from './questions';

// Placeholder thresholds — tune with `npm run eval`.
export const TELL_THRESHOLD = 0.6;
/** Minimum P(template) for each tier. */
export const TIER_THRESHOLDS = { some: 0.5, slop: 0.8 };
/**
 * Each non-green tier also needs this many distinct kinds of evidence (fired
 * patterns / phrase hits), so a colored badge always has a named reason.
 */
export const MIN_SIGNALS = { some: 1, slop: 2 };

export type Tier = 'clean' | 'some' | 'slop';

/** `counted`: whether this pattern counts toward the signal requirement. */
export type FiredTell = { key: TellKey; label: string; p: number; counted: boolean };

export type Verdict = {
  /** 0..1: Jev's probability that the post is a template (level ≥ TEMPLATE_LEVEL). */
  score: number;
  tier: Tier;
  /** True when too few signals backed Jev's read, so the tier was lowered. */
  capped: boolean;
  /** The tier Jev's probability alone would give, before the signal requirement. */
  jevTier: Tier;
  /** Distinct kinds of evidence: fired patterns plus phrase hits, de-duplicated. */
  signals: number;
  /** Jev's probability for each slop level (index = level). */
  levels: number[];
  /** Jev's probability-weighted average level, 0..3. */
  jevScore: number;
  tells: FiredTell[];
  heuristics: string[];
  /** Separate AI-authorship read. Informational only: never affects tier or signals. */
  ai: { p: number | null; hits: string[] };
  partial: boolean;
  cost: number;
  model: string;
};

export function tierFor(pTemplate: number, signals: number): { tier: Tier; jevTier: Tier; capped: boolean } {
  const jevTier: Tier =
    pTemplate >= TIER_THRESHOLDS.slop ? 'slop' : pTemplate >= TIER_THRESHOLDS.some ? 'some' : 'clean';
  let tier = jevTier;
  if (tier === 'slop' && signals < MIN_SIGNALS.slop) tier = 'some';
  if (tier === 'some' && signals < MIN_SIGNALS.some) tier = 'clean';
  return { tier, jevTier, capped: tier !== jevTier };
}

function levelProbabilities(answer: Answer | undefined): number[] {
  const n = SLOP_LEVELS.length;
  if (answer?.type !== 'score') return new Array<number>(n).fill(0);
  const probs = Array.from({ length: n }, (_, i) => answer.probabilities?.[String(i)] ?? 0);
  if (probs.some((p) => p > 0)) return probs;
  // No distribution returned: put all the mass on the nearest level.
  const out = new Array<number>(n).fill(0);
  out[Math.min(n - 1, Math.max(0, Math.round(answer.score)))] = 1;
  return out;
}

function aiProbability(answer: Answer | undefined): number | null {
  // null for answers cached before the AI question existed.
  return answer?.type === 'noul' ? answer.noul : null;
}

export function combine(
  res: DecisionsResponse<SlopQuestionKey>,
  hits: HeuristicHit[],
  partial: boolean,
  aiHits: string[] = [],
): Verdict {
  const slop = res.answers.slop;
  const levels = levelProbabilities(slop);
  const pTemplate = Math.min(1, levels.slice(TEMPLATE_LEVEL).reduce((a, b) => a + b, 0));

  const tells: FiredTell[] = [];
  for (const key of TELL_KEYS) {
    const a = res.answers[key];
    if (a?.type === 'noul' && a.noul >= TELL_THRESHOLD) {
      const def: { label: string; countsAsSignal?: boolean } = TELLS[key];
      tells.push({ key, label: def.label, p: a.noul, counted: def.countsAsSignal !== false });
    }
  }
  tells.sort((a, b) => b.p - a.p);

  // A phrase hit and the Jev pattern it's evidence for count once.
  const kinds = new Set<string>(tells.filter((t) => t.counted).map((t) => t.key));
  for (const h of hits) if (h.counted !== false) kinds.add(h.tell ?? h.label);
  const signals = kinds.size;

  return {
    score: pTemplate,
    ...tierFor(pTemplate, signals),
    signals,
    levels,
    jevScore: slop?.type === 'score' ? slop.score : 0,
    tells,
    heuristics: hits.map((h) => (h.counted === false ? `${h.label} (context, not counted)` : h.label)),
    ai: { p: aiProbability(res.answers.ai_style), hits: aiHits },
    partial,
    cost: res.usage?.cost ?? 0,
    model: res.model,
  };
}
