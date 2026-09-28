import { describe, expect, it } from 'vitest';
import { fitThresholds } from './calibrate';
import { normalize } from './classify';
import { runLocalChecks, type LocalChecks } from './heuristics';
import type { Answer } from './jev';
import { INTENT_KEYS, type IntentKey, type QuestionKey } from './questions';
import { applyUserLabel, combine, DEFAULT_THRESHOLDS, type JevAnswers } from './score';

const SLOP = `I got rejected from 47 jobs.

Then I realized something.

It's not about the resume. It's about the story.

✅ Consistency beats talent
✅ Your network is your net worth
✅ Growth happens outside your comfort zone

Let that sink in.

Agree?`;

const CLEAN =
  'We shipped the Postgres 17 upgrade last Tuesday. Replication slots had to be recreated and one report got 3x slower until we re-ran ANALYZE.';

const NONE: LocalChecks = { bait: [], value: [], formula: [], ai: [] };

/** Builds a Jev response: value-level distribution, intent distribution, yes/no answers. */
function answers(
  value: number[],
  intent: Partial<Record<IntentKey, number>> = {},
  nouls: Partial<Record<QuestionKey, number>> = {},
): JevAnswers {
  const intentProbs = Object.fromEntries(INTENT_KEYS.map((k) => [k, intent[k] ?? 0]));
  const top = INTENT_KEYS.reduce((a, b) => ((intent[b] ?? 0) > (intent[a] ?? 0) ? b : a));
  const out: Record<string, Answer> = {
    value: {
      type: 'score',
      score: value.reduce((s, p, i) => s + p * i, 0),
      confidence: 0.9,
      probabilities: Object.fromEntries(value.map((p, i) => [String(i), p])),
      legend: {},
    },
    intent: { type: 'choice', choice: top, confidence: 0.9, probabilities: intentProbs },
  };
  for (const [k, v] of Object.entries(nouls)) out[k] = { type: 'noul', noul: v };
  return {
    model: 'typesafe/jev-1.13-test',
    answers: out as JevAnswers['answers'],
    usage: { input_tokens: 900, output_tokens: 90, cost: 0.00004 },
  };
}

describe('local checks', () => {
  it('sorts a formula post into bait phrases and formula tells', () => {
    const c = runLocalChecks(SLOP);
    expect(c.bait).toEqual([{ label: 'Closing "Agree?"', tactic: 'engagement_ask' }]);
    expect(c.formula).toEqual(
      expect.arrayContaining(['"Let that sink in"', '"It\'s not X, it\'s Y"', '3 emoji bullets', 'One-line paragraphs']),
    );
  });

  it('stays quiet on specific prose', () => {
    expect(runLocalChecks(CLEAN)).toEqual(NONE);
  });

  it('names gated value and link-in-comments', () => {
    const tactics = (t: string) => runLocalChecks(t).bait.map((b) => b.tactic);
    expect(tactics('Comment "AI" and I\'ll send you the guide.')).toEqual(['gated_value']);
    expect(tactics('DM me for the template.')).toEqual(['gated_value']);
    expect(tactics('Full write-up: link in the first comment.')).toEqual(['link_in_comments']);
    expect(tactics('Tag someone who needs this ♻️')).toEqual(['engagement_ask', 'engagement_ask']);
  });

  it('finds value clues', () => {
    expect(runLocalChecks('Cut p95 from 820 ms to 140 ms and saved $4k a month: https://example.com/p').value).toEqual([
      '3 numbers with units',
      'Links to an outside source',
    ]);
    expect(runLocalChecks('Run `git bisect run npm test` and walk away.').value).toEqual(['Contains code']);
  });

  it('ignores ordinary writing', () => {
    const fired = (t: string) => {
      const c = runLocalChecks(t);
      return [...c.bait.map((b) => b.label), ...c.formula];
    };
    expect(fired('Thoughts? I was surprised too.\nWe measured it twice and got the same slowdown.')).toEqual([]);
    expect(fired("So here's the thing we missed in the Postgres upgrade: slots.")).toEqual([]);
    expect(fired('This compiler flag was a game-changer for our build times.')).toEqual([]);
    expect(fired('Changes:\n• faster cold start\n• smaller bundle\n• fixed the leak')).toEqual([]);
    expect(fired('a b\nc d\ne f\ng h\ni j\nk l')).toEqual([]);
  });

  it('flags assistant-style phrasing on the AI line only', () => {
    const text = `Here's why this matters:

🚀 The Problem:
Teams navigate the complexities of scale — and it's a pivotal moment — one that underscores everything.

💡 The Fix:
Let's dive in — briefly. In conclusion, it's a testament to focus.`;
    const c = runLocalChecks(text);
    expect(c.ai).toEqual(
      expect.arrayContaining(['"Here\'s why/how:" lead-in', '"Let\'s dive in / unpack"', 'Summarizing close', '3 em-dashes', '2 emoji section headers']),
    );
    expect(c.bait).toEqual([]);
  });
});

describe('normalize', () => {
  it('collapses whitespace but keeps paragraph breaks', () => {
    expect(normalize('  a  b\n\n\n\nc  ')).toBe('a b\n\nc');
  });
});

describe('combine', () => {
  it('useful: concrete value, no bait', () => {
    const v = combine(answers([0, 0.1, 0.3, 0.6], { inform: 0.9 }), NONE);
    expect(v.pUseful).toBeCloseTo(0.9);
    expect(v.category).toBe('useful');
    expect(v.intents[0]?.key).toBe('inform');
  });

  it('bait: no value, a tactic, and a bait intent', () => {
    const v = combine(answers([0.5, 0.4, 0.1, 0], { farm_engagement: 0.7, opinion: 0.3 }, { engagement_ask: 0.9 }), NONE);
    expect(v.pBaitIntent).toBeCloseTo(0.7);
    expect(v.category).toBe('bait');
  });

  it('baity: real value behind two bait tactics', () => {
    const local = { ...NONE, bait: [{ label: '"DM me for…"', tactic: 'gated_value' as const }] };
    const v = combine(answers([0, 0.1, 0.4, 0.5], { inform: 0.6 }, { engagement_ask: 0.8 }), local);
    expect(v.tactics.map((t) => t.key).sort()).toEqual(['engagement_ask', 'gated_value']);
    expect(v.category).toBe('baity');
  });

  it('casual: a sincere rant is neither useful nor bait', () => {
    const v = combine(answers([0.4, 0.5, 0.1, 0], { opinion: 0.8, provoke: 0.1 }, { rage_bait: 0.3 }), NONE);
    expect(v.category).toBe('casual');
    expect(v.tactics).toEqual([]);
  });

  it('one tactic without a bait intent is not bait (a job post saying "link in comments")', () => {
    const local = { ...NONE, bait: [{ label: '"Link in comments"', tactic: 'link_in_comments' as const }] };
    const v = combine(answers([0, 0, 0.3, 0.7], { promote: 0.8, inform: 0.2 }), local);
    expect(v.tactics).toHaveLength(1);
    expect(v.category).toBe('useful');
  });

  it('counts a Jev tactic and its matching phrase once', () => {
    const local = { ...NONE, bait: [{ label: 'Closing "Agree?"', tactic: 'engagement_ask' as const }] };
    const v = combine(answers([1, 0, 0, 0], { opinion: 1 }, { engagement_ask: 0.9 }), local);
    expect(v.tactics).toEqual([{ key: 'engagement_ask', label: 'Asks for engagement', p: 0.9, phrases: ['Closing "Agree?"'] }]);
  });

  it('value clues tip a borderline post into useful', () => {
    const res = answers([0.2, 0.4, 0.3, 0.1], { inform: 1 });
    expect(combine(res, NONE).category).toBe('casual');
    expect(combine(res, { ...NONE, value: ['3 numbers with units', 'Contains code'] }).category).toBe('useful');
  });

  it('formula writing and AI style never make a post bait', () => {
    const res = answers([0.4, 0.5, 0.1, 0], { opinion: 1 }, { formula: 0.99, ai_style: 0.99 });
    const v = combine(res, { ...NONE, formula: ['One-line paragraphs'], ai: ['4 em-dashes'] });
    expect(v.category).toBe('casual');
    expect(v.formula).toEqual({ p: 0.99, hits: ['One-line paragraphs'] });
    expect(v.ai).toEqual({ p: 0.99, hits: ['4 em-dashes'] });
  });

  it('a staged story with a moral is Casual, not Useful (the camera-off interview post)', () => {
    const text = `A candidate joined the interview without turning on his camera.🥺

The manager messaged me: "Unprofessional. Should we drop?"

I asked him to wait.

I called the candidate separately.

He said:

"Sir, I'm sitting in a shared room with 6 people.

I don't want to look disrespectful."

That hit hard.

We continued audio-only.

No bias. No assumptions.

He cleared the interview.

Got the offer.

Joined last week.

Sometimes professionalism isn't about cameras, suits or backgrounds.

It's about showing up even when circumstances aren't ideal.

Before rejecting someone for how they appear, check why they're there.

Empathy doesn't lower standards.

It reveals talent. ❤️`;
    // Jev's actual read under the old wording: 88% "Idea", Opinion 88%, formula 86%.
    const res = answers([0, 0.11, 0.88, 0.01], { opinion: 0.88, personal: 0.11, farm_engagement: 0.01 }, { formula: 0.86 });
    const v = combine(res, runLocalChecks(normalize(text)));
    expect(v.usefulFrom).toBe(3);
    expect(v.pUseful).toBeCloseTo(0.01);
    expect(v.tactics.map((t) => t.key)).toEqual(['staged_story']);
    expect(v.category).toBe('casual');
  });

  it('an idea still counts as useful when the post is not formula-written', () => {
    const v = combine(answers([0, 0.1, 0.8, 0.1], { opinion: 1 }, { formula: 0.3 }), NONE);
    expect(v.usefulFrom).toBe(2);
    expect(v.category).toBe('useful');
  });

  it("uses the user's label over the model's", () => {
    const v = combine(answers([0, 0, 0.2, 0.8], { inform: 1 }), NONE);
    const labeled = applyUserLabel(v, 'bait');
    expect(labeled).toMatchObject({ category: 'bait', predicted: 'useful', userLabel: 'bait', overridden: true });
    expect(applyUserLabel(v, 'useful')).toMatchObject({ category: 'useful', overridden: false });
  });

  it('falls back to the nearest level when Jev returns no distribution', () => {
    const res = answers([0, 0, 0, 0]);
    (res.answers.value as { score: number }).score = 2.4;
    expect(combine(res, NONE).valueLevels).toEqual([0, 0, 1, 0]);
  });
});

describe('calibration', () => {
  // Posts where the user calls one tactic + 40% bait intent "bait", which the
  // default (50%) misses, but 20% bait intent is still "casual".
  const baitAt40 = answers([0.9, 0.1, 0, 0], { farm_engagement: 0.4, opinion: 0.6 }, { engagement_ask: 0.9 });
  const casualAt20 = answers([0.9, 0.1, 0, 0], { farm_engagement: 0.2, opinion: 0.8 }, { engagement_ask: 0.9 });

  it('moves thresholds just far enough to match the labels', () => {
    const fit = fitThresholds([
      ...Array(3).fill({ res: baitAt40, text: '', label: 'bait' }),
      ...Array(3).fill({ res: casualAt20, text: '', label: 'casual' }),
    ]);
    expect(fit.defaultAgreement).toBe(0.5);
    expect(fit.agreement).toBe(1);
    expect(fit.thresholds).toEqual({ useful: DEFAULT_THRESHOLDS.useful, baitIntent: 0.4 });
  });

  it('keeps the defaults when they already match', () => {
    const fit = fitThresholds([
      { res: casualAt20, text: '', label: 'casual' },
      { res: answers([0, 0, 0.2, 0.8], { inform: 1 }), text: '', label: 'useful' },
    ]);
    expect(fit.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });
});
