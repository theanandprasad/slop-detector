import { describe, expect, it } from 'vitest';
import { normalize } from './classify';
import { runAiHeuristics, runHeuristics } from './heuristics';
import type { DecisionsResponse } from './jev';
import type { SlopQuestionKey } from './questions';
import { combine, tierFor } from './score';

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

describe('heuristics', () => {
  it('flags stock slop patterns', () => {
    const hits = runHeuristics(SLOP).hits.map((h) => h.label);
    expect(hits).toContain('"Let that sink in"');
    expect(hits).toContain('Closing "Agree?"');
    expect(hits).toContain('"It\'s not X, it\'s Y"');
    expect(hits).toContain('3 emoji bullets');
    expect(hits).toContain('One-line paragraphs');
  });

  it('stays quiet on specific prose', () => {
    expect(runHeuristics(CLEAN).hits).toEqual([]);
  });

  it('ignores ordinary writing that the old checks flagged', () => {
    const labels = (t: string) => runHeuristics(t).hits.map((h) => h.label);
    // A real question mid-post isn't bait; only a closing line counts.
    expect(labels('Thoughts? I was surprised too.\nWe measured it twice and got the same 3x slowdown.')).toEqual([]);
    // "Here's the thing" mid-sentence is conversation, not a hook.
    expect(labels('So here\'s the thing we missed in the Postgres upgrade: slots.')).toEqual([]);
    // One buzzword is word choice.
    expect(labels('This compiler flag was a game-changer for our build times.')).toEqual([]);
    // Plain bullets are list formatting.
    expect(labels('Changes:\n• faster cold start\n• smaller bundle\n• fixed the leak')).toEqual([]);
    // Six short lines is just short paragraphs.
    expect(labels('a b\nc d\ne f\ng h\ni j\nk l')).toEqual([]);
  });

  it('still catches formula moves', () => {
    const labels = (t: string) => runHeuristics(t).hits.map((h) => h.label);
    expect(labels('Big lesson from this week.\nThoughts? 👇')).toEqual(['Closing "Thoughts?"']);
    expect(labels('In today\'s fast-paced world, delve into your why.')).toEqual(['Buzzwords: in today\'s fast-paced, delve']);
  });

  it('shows hashtags and 🧵 as context without counting them', () => {
    const hits = runHeuristics('Thread 🧵 #a #b #c #d #e').hits;
    expect(hits.every((h) => h.counted === false)).toBe(true);
    const v = combine(response([0, 0, 0.5, 0.5], { engagement_bait: 0.9 }), hits, false);
    expect(v.signals).toBe(1);
    expect(v.tier).toBe('some');
  });
});

describe('AI-style heuristics', () => {
  it('flags assistant-style phrasing', () => {
    const text = `Here's why this matters:

🚀 The Problem:
Teams navigate the complexities of scale — and it's a pivotal moment — one that underscores everything.

💡 The Fix:
Let's dive in — briefly. In conclusion, it's a testament to focus.`;
    const hits = runAiHeuristics(text);
    expect(hits).toContain('"Here\'s why/how:" lead-in');
    expect(hits).toContain('"Let\'s dive in / unpack"');
    expect(hits).toContain('Summarizing close');
    expect(hits).toContain('3 em-dashes');
    expect(hits).toContain('2 emoji section headers');
    expect(hits.some((h) => h.startsWith('AI vocabulary'))).toBe(true);
  });

  it('stays quiet on specific prose', () => {
    expect(runAiHeuristics(CLEAN)).toEqual([]);
  });
});

describe('normalize', () => {
  it('collapses whitespace but keeps paragraph breaks', () => {
    expect(normalize('  a  b\n\n\n\nc  ')).toBe('a b\n\nc');
  });
});

function response(
  levels: number[],
  nouls: Partial<Record<SlopQuestionKey, number>>,
): DecisionsResponse<SlopQuestionKey> {
  const probabilities = Object.fromEntries(levels.map((p, i) => [String(i), p]));
  const score = levels.reduce((sum, p, i) => sum + p * i, 0);
  const answers: Record<string, unknown> = {
    slop: { type: 'score', score, confidence: 0.9, probabilities, legend: {} },
  };
  for (const [k, v] of Object.entries(nouls)) answers[k] = { type: 'noul', noul: v };
  return {
    model: 'typesafe/jev-1.13-test',
    answers: answers as DecisionsResponse<SlopQuestionKey>['answers'],
    usage: { input_tokens: 700, output_tokens: 80, cost: 0.00003 },
  };
}

describe('combine', () => {
  it('scores P(template) and reports fired tells sorted by probability', () => {
    const v = combine(response([0, 0.1, 0.3, 0.6], { engagement_bait: 0.7, broetry: 0.95, no_specifics: 0.3 }), [], false);
    expect(v.score).toBeCloseTo(0.9);
    expect(v.tier).toBe('slop');
    expect(v.signals).toBe(2);
    expect(v.tells.map((t) => t.key)).toEqual(['broetry', 'engagement_bait']);
  });

  it('holds a confident Jev verdict at 🟡 when only one signal backs it', () => {
    const v = combine(response([0, 0.05, 0.6, 0.35], { engagement_bait: 0.95 }), [], false);
    expect(v.tier).toBe('some');
    expect(v.capped).toBe(true);
  });

  it('counts a phrase hit and its matching Jev pattern as one signal', () => {
    const v = combine(response([0, 0, 0.5, 0.5], { engagement_bait: 0.9 }), [{ label: '"Agree?"', tell: 'engagement_bait' }], false);
    expect(v.signals).toBe(1);
    expect(v.tier).toBe('some');
    const w = combine(response([0, 0, 0.5, 0.5], { engagement_bait: 0.9 }), [{ label: '6 hashtags' }], false);
    expect(w.signals).toBe(2);
    expect(w.tier).toBe('slop');
  });

  it('phrase hits alone never raise the score', () => {
    const v = combine(response([0.9, 0.1, 0, 0], {}), [{ label: 'a' }, { label: 'b' }, { label: 'c' }], false);
    expect(v.score).toBe(0);
    expect(v.tier).toBe('clean');
  });

  it('falls back to the nearest level when Jev returns no distribution', () => {
    const res = response([0, 0, 0, 0], {});
    (res.answers.slop as { score: number }).score = 2.4;
    expect(combine(res, [], false).levels).toEqual([0, 0, 1, 0]);
  });

  it('reports the AI read without letting it touch the tier', () => {
    const v = combine(response([0.9, 0.1, 0, 0], { ai_style: 0.97 }), [], false, ['3 em-dashes']);
    expect(v.ai).toEqual({ p: 0.97, hits: ['3 em-dashes'] });
    expect(v.tier).toBe('clean');
    expect(v.signals).toBe(0);
    expect(combine(response([0.9, 0.1, 0, 0], {}), [], false).ai.p).toBeNull();
  });

  it('keeps a split read below 🟡', () => {
    // The BeANANA Republic rant: Jev split 43% onto template levels.
    const v = combine(response([0.14, 0.43, 0.37, 0.06], {}), [], false);
    expect(v.jevTier).toBe('clean');
    expect(v.capped).toBe(false);
  });

  it('tiers', () => {
    expect(tierFor(0.1, 5)).toEqual({ tier: 'clean', jevTier: 'clean', capped: false });
    expect(tierFor(0.45, 5)).toEqual({ tier: 'clean', jevTier: 'clean', capped: false });
    expect(tierFor(0.5, 1)).toEqual({ tier: 'some', jevTier: 'some', capped: false });
    expect(tierFor(0.75, 5)).toEqual({ tier: 'some', jevTier: 'some', capped: false });
    expect(tierFor(0.8, 2)).toEqual({ tier: 'slop', jevTier: 'slop', capped: false });
    expect(tierFor(0.8, 1)).toEqual({ tier: 'some', jevTier: 'slop', capped: true });
  });

  it('shows "No concrete specifics" but does not count it as a signal', () => {
    // The Mark Manson aphorism: 88% on template levels, only no_specifics fired.
    const v = combine(response([0.02, 0.1, 0.78, 0.1], { no_specifics: 0.98 }), [], false);
    expect(v.tells).toEqual([{ key: 'no_specifics', label: 'No concrete specifics', p: 0.98, counted: false }]);
    expect(v.signals).toBe(0);
    expect(v.jevTier).toBe('slop');
    expect(v.tier).toBe('clean');
  });

  it('never colors a badge without a named signal', () => {
    const v = combine(response([0.05, 0.3, 0.55, 0.1], {}), [], false);
    expect(v.score).toBeCloseTo(0.65);
    expect(v.jevTier).toBe('some');
    expect(v.tier).toBe('clean');
    expect(v.capped).toBe(true);
    expect(tierFor(0.9, 0).tier).toBe('clean');
  });
});
