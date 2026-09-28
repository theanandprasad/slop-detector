// Runs the Jev question set over a labeled set and reports how well it matches.
//
//   OPENROUTER_API_KEY=sk-or-... npm run eval [-- path/to/labeled.jsonl]
//
// Input: JSONL, one post per line:
//   {"platform":"linkedin"|"x","text":"…","category":"useful"|"casual"|"baity"|"bait","ai"?:0|1}
//   The options page's "Export labels" produces exactly this format.
//   ai (optional) 1 = known AI-written, 0 = known human-written. Only label posts
//   whose origin you actually know; it's used to check the separate AI read.
// Output: confusion matrix, per-axis and per-tactic stats, fitted thresholds,
// latency and cost; raw rows to eval/results.jsonl.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fitThresholds } from '../src/lib/calibrate';
import { askJev, scoreResponse } from '../src/lib/classify';
import { DEFAULT_MODEL } from '../src/lib/jev';
import { TACTIC_KEYS, type Platform } from '../src/lib/questions';
import { CATEGORIES, type Category, type JevAnswers, type Verdict } from '../src/lib/score';

type Row = { platform: Platform; text: string; category: Category; ai?: 0 | 1 };
type Result = Row & { res?: JevAnswers; verdict?: Verdict; error?: string; ms: number };

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('Set OPENROUTER_API_KEY');
  process.exit(1);
}
const model = process.env.JEV_MODEL ?? DEFAULT_MODEL;
const path = process.argv[2] ?? (existsSync('eval/labeled.jsonl') ? 'eval/labeled.jsonl' : 'eval/labeled.example.jsonl');
const CONCURRENCY = 4;

const rows: Row[] = readFileSync(path, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Row)
  .filter((r) => CATEGORIES.includes(r.category));

console.log(`Evaluating ${rows.length} posts from ${path} with ${model}\n`);

const results: Result[] = new Array(rows.length);
let next = 0;
async function worker() {
  while (next < rows.length) {
    const i = next++;
    const row = rows[i]!;
    const started = performance.now();
    try {
      const res = await askJev({ apiKey: apiKey!, model, platform: row.platform, text: row.text });
      results[i] = { ...row, res, verdict: scoreResponse(res, row.text), ms: performance.now() - started };
    } catch (err) {
      results[i] = { ...row, error: String(err), ms: performance.now() - started };
    }
    process.stdout.write('.');
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log('\n');

const ok = results.filter((r): r is Result & { res: JevAnswers; verdict: Verdict } => !!r.verdict);
const failed = results.length - ok.length;
if (failed) console.log(`⚠ ${failed} failed: ${results.find((r) => r.error)?.error}\n`);

// Confusion matrix: rows = your label, columns = predicted.
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('label \\ predicted', 18)}${CATEGORIES.map((c) => pad(c, 8)).join('')}`);
for (const label of CATEGORIES) {
  const counts = CATEGORIES.map((p) => ok.filter((r) => r.category === label && r.verdict.predicted === p).length);
  console.log(`${pad(label, 18)}${counts.map((n) => pad(String(n), 8)).join('')}`);
}
const correct = ok.filter((r) => r.verdict.predicted === r.category).length;
console.log(`\naccuracy ${ok.length ? ((correct / ok.length) * 100).toFixed(0) : 0}% (${correct}/${ok.length})`);

// Each axis on its own.
const isUseful = (c: Category) => c === 'useful' || c === 'baity';
const isBait = (c: Category) => c === 'bait' || c === 'baity';
const axis = (name: string, f: (c: Category) => boolean) => {
  const agree = ok.filter((r) => f(r.category) === f(r.verdict.predicted)).length;
  console.log(`${pad(name, 8)} axis agrees on ${agree}/${ok.length}`);
};
axis('useful', isUseful);
axis('bait', isBait);

// Each tactic should fire far more on bait than on non-bait; if not, reword it.
const baitRows = ok.filter((r) => isBait(r.category));
const cleanRows = ok.filter((r) => !isBait(r.category));
const rate = (set: typeof ok, key: string) =>
  set.length ? set.filter((r) => r.verdict.tactics.some((t) => t.key === key)).length / set.length : 0;
console.log('\ntactic               on bait  on non-bait');
for (const key of TACTIC_KEYS) {
  console.log(`${pad(key, 20)} ${(rate(baitRows, key) * 100).toFixed(0).padStart(6)}%  ${(rate(cleanRows, key) * 100).toFixed(0).padStart(10)}%`);
}

// Thresholds that would best match this set (same fit the extension runs on your 👍/👎).
if (ok.length) {
  const fit = fitThresholds(ok.map((r) => ({ res: r.res, text: r.text, label: r.category })));
  console.log(
    `\nbest thresholds: useful ≥ ${fit.thresholds.useful}, bait intent ≥ ${fit.thresholds.baitIntent}` +
      ` → ${(fit.agreement * 100).toFixed(0)}% (defaults ${(fit.defaultAgreement * 100).toFixed(0)}%)`,
  );
}

// Separate AI read, only for posts with a known origin.
const aiRows = ok.filter((r) => r.ai !== undefined && r.verdict.ai.p !== null);
if (aiRows.length) {
  console.log(`\nAI read on ${aiRows.length} posts with known origin`);
  console.log('threshold  precision  recall  accuracy');
  for (let t = 0.3; t <= 0.91; t += 0.1) {
    let tp = 0, fp = 0, fn = 0, right = 0;
    for (const r of aiRows) {
      const flagged = r.verdict.ai.p! >= t;
      if (flagged && r.ai === 1) tp++;
      else if (flagged && r.ai === 0) fp++;
      else if (!flagged && r.ai === 1) fn++;
      if (flagged === (r.ai === 1)) right++;
    }
    const p = tp + fp ? tp / (tp + fp) : 0;
    const rc = tp + fn ? tp / (tp + fn) : 0;
    console.log(`${t.toFixed(1).padEnd(10)} ${p.toFixed(2).padEnd(10)} ${rc.toFixed(2).padEnd(7)} ${(right / aiRows.length).toFixed(2)}`);
  }
}

const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
const cost = ok.reduce((s, r) => s + r.verdict.cost, 0);
console.log(
  `\nlatency p50 ${Math.round(ms[Math.floor(ms.length / 2)] ?? 0)} ms, p90 ${Math.round(ms[Math.floor(ms.length * 0.9)] ?? 0)} ms` +
    `\ncost total $${cost.toFixed(5)}, per post $${ok.length ? (cost / ok.length).toFixed(6) : '—'}`,
);

writeFileSync('eval/results.jsonl', results.map(({ res: _res, ...r }) => JSON.stringify(r)).join('\n') + '\n');
console.log('\nRaw results → eval/results.jsonl');
