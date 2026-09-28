// Re-fits the scoring thresholds to a set of labeled posts, by replaying Jev's
// saved answers locally (no API calls). Used by the extension on the user's own
// 👍/👎 labels, and by the eval script on eval/labeled.jsonl.

import { normalize } from './classify';
import { runLocalChecks, type LocalChecks } from './heuristics';
import { combine, DEFAULT_THRESHOLDS, type Category, type JevAnswers, type Thresholds } from './score';

export const MIN_LABELS_TO_CALIBRATE = 15;

export type Labeled = { res: JevAnswers; text: string; label: Category };

export type Fit = {
  thresholds: Thresholds;
  /** Share of labels the fitted thresholds agree with. */
  agreement: number;
  /** Share of labels the default thresholds agree with. */
  defaultAgreement: number;
  n: number;
};

type Prepared = { res: JevAnswers; local: LocalChecks; label: Category };

function agreementOf(items: Prepared[], thresholds: Thresholds): number {
  if (!items.length) return 0;
  let hits = 0;
  for (const i of items) if (combine(i.res, i.local, { thresholds }).category === i.label) hits++;
  return hits / items.length;
}

const distance = (t: Thresholds) =>
  Math.abs(t.useful - DEFAULT_THRESHOLDS.useful) + Math.abs(t.baitIntent - DEFAULT_THRESHOLDS.baitIntent);

const steps = (from: number, to: number) =>
  Array.from({ length: Math.round((to - from) / 0.05) + 1 }, (_, i) => Math.round((from + i * 0.05) * 100) / 100);

/** Grid-searches thresholds; only moves off the defaults when that agrees with more labels. */
export function fitThresholds(labeled: Labeled[]): Fit {
  const items: Prepared[] = labeled.map((l) => ({ res: l.res, local: runLocalChecks(normalize(l.text)), label: l.label }));
  const defaultAgreement = agreementOf(items, DEFAULT_THRESHOLDS);
  let best = { thresholds: DEFAULT_THRESHOLDS, agreement: defaultAgreement };

  for (const useful of steps(0.3, 0.7)) {
    for (const baitIntent of steps(0.3, 0.8)) {
      const thresholds = { useful, baitIntent };
      const agreement = agreementOf(items, thresholds);
      const better = agreement > best.agreement + 1e-9;
      const tieButCloser = Math.abs(agreement - best.agreement) < 1e-9 && distance(thresholds) < distance(best.thresholds);
      if (better || tieButCloser) best = { thresholds, agreement };
    }
  }
  return { ...best, defaultAgreement, n: items.length };
}
