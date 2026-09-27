// Runs the Jev question set over a labeled set and reports how well it separates slop.
//
//   OPENROUTER_API_KEY=sk-or-... npm run eval [-- path/to/labeled.jsonl]
//
// Input: JSONL, one post per line: {"platform":"linkedin"|"x","text":"…","label":0|1,"ai"?:0|1}
//   label 1 = slop, 0 = not slop.
//   ai (optional) 1 = known AI-written, 0 = known human-written. Only label posts
//   whose origin you actually know; it's used to check the separate AI read.
// Output: threshold table, per-tell fire rates, latency and cost; raw rows to eval/results.jsonl.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { classify } from '../src/lib/classify';
import { DEFAULT_MODEL } from '../src/lib/jev';
import { TELL_KEYS } from '../src/lib/questions';
import type { Verdict } from '../src/lib/score';

type Row = { platform: 'linkedin' | 'x'; text: string; label: 0 | 1; ai?: 0 | 1 };
type Result = Row & { verdict?: Verdict; error?: string; ms: number };

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
  .map((l) => JSON.parse(l) as Row);

console.log(`Evaluating ${rows.length} posts from ${path} with ${model}\n`);

const results: Result[] = new Array(rows.length);
let next = 0;
async function worker() {
  while (next < rows.length) {
    const i = next++;
    const row = rows[i]!;
    const started = performance.now();
    try {
      const verdict = await classify({ apiKey: apiKey!, model, platform: row.platform, text: row.text });
      results[i] = { ...row, verdict, ms: performance.now() - started };
    } catch (err) {
      results[i] = { ...row, error: String(err), ms: performance.now() - started };
    }
    process.stdout.write('.');
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log('\n');

const ok = results.filter((r): r is Result & { verdict: Verdict } => !!r.verdict);
const failed = results.length - ok.length;
if (failed) console.log(`⚠ ${failed} failed: ${results.find((r) => r.error)?.error}\n`);

// Threshold sweep on the combined score.
console.log('threshold  precision  recall  f1     flagged');
for (let t = 0.2; t <= 0.81; t += 0.05) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of ok) {
    const flagged = r.verdict.score >= t;
    if (flagged && r.label === 1) tp++;
    else if (flagged && r.label === 0) fp++;
    else if (!flagged && r.label === 1) fn++;
  }
  const p = tp + fp ? tp / (tp + fp) : 0;
  const rc = tp + fn ? tp / (tp + fn) : 0;
  const f1 = p + rc ? (2 * p * rc) / (p + rc) : 0;
  console.log(`${t.toFixed(2).padEnd(10)} ${p.toFixed(2).padEnd(10)} ${rc.toFixed(2).padEnd(7)} ${f1.toFixed(2).padEnd(6)} ${tp + fp}`);
}

// Each tell should fire much more on slop than on non-slop; if not, reword it.
const slop = ok.filter((r) => r.label === 1);
const clean = ok.filter((r) => r.label === 0);
const rate = (set: typeof ok, key: string) =>
  set.length ? set.filter((r) => r.verdict.tells.some((t) => t.key === key)).length / set.length : 0;
console.log('\ntell                 on slop  on clean');
for (const key of TELL_KEYS) {
  console.log(`${key.padEnd(20)} ${(rate(slop, key) * 100).toFixed(0).padStart(6)}%  ${(rate(clean, key) * 100).toFixed(0).padStart(7)}%`);
}

// Tier breakdown: how many posts land in each badge color, by label.
console.log('\ntier     slop-labeled  clean-labeled');
for (const tier of ['slop', 'some', 'clean'] as const) {
  const n = (set: typeof ok) => set.filter((r) => r.verdict.tier === tier).length;
  console.log(`${tier.padEnd(8)} ${String(n(slop)).padStart(12)}  ${String(n(clean)).padStart(13)}`);
}

// Separate AI read, only for posts with a known origin.
const aiRows = ok.filter((r) => r.ai !== undefined && r.verdict.ai.p !== null);
if (aiRows.length) {
  console.log(`\nAI read on ${aiRows.length} posts with known origin`);
  console.log('threshold  precision  recall  accuracy');
  for (let t = 0.3; t <= 0.91; t += 0.1) {
    let tp = 0, fp = 0, fn = 0, correct = 0;
    for (const r of aiRows) {
      const flagged = r.verdict.ai.p! >= t;
      if (flagged && r.ai === 1) tp++;
      else if (flagged && r.ai === 0) fp++;
      else if (!flagged && r.ai === 1) fn++;
      if (flagged === (r.ai === 1)) correct++;
    }
    const p = tp + fp ? tp / (tp + fp) : 0;
    const rc = tp + fn ? tp / (tp + fn) : 0;
    console.log(`${t.toFixed(1).padEnd(10)} ${p.toFixed(2).padEnd(10)} ${rc.toFixed(2).padEnd(7)} ${(correct / aiRows.length).toFixed(2)}`);
  }
}

const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
const cost = ok.reduce((s, r) => s + r.verdict.cost, 0);
console.log(
  `\nlatency p50 ${Math.round(ms[Math.floor(ms.length / 2)] ?? 0)} ms, p90 ${Math.round(ms[Math.floor(ms.length * 0.9)] ?? 0)} ms` +
    `\ncost total $${cost.toFixed(5)}, per post $${ok.length ? (cost / ok.length).toFixed(6) : '—'}`,
);

writeFileSync('eval/results.jsonl', results.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log('\nRaw results → eval/results.jsonl');
