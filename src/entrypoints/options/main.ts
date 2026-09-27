import { clearCache } from '@/lib/cache';
import { classify } from '@/lib/classify';
import { getSettings, getStats, resetStats, saveSettings } from '@/lib/settings';

const SAMPLE_POST = `I got rejected from 47 jobs.

Then I realized something.

It's not about the resume. It's about the story.

Here's what nobody tells you:
✅ Consistency beats talent
✅ Your network is your net worth
✅ Growth happens outside your comfort zone

Let that sink in.

Agree? ♻️ Repost to help someone in your network.`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const apiKey = $<HTMLInputElement>('apiKey');
const model = $<HTMLInputElement>('model');
const siteLinkedin = $<HTMLInputElement>('site-linkedin');
const siteX = $<HTMLInputElement>('site-x');
const minChars = $<HTMLInputElement>('minChars');
const status = $('status');
const testOut = $<HTMLPreElement>('testOut');

async function load() {
  const s = await getSettings();
  apiKey.value = s.apiKey;
  model.value = s.model;
  siteLinkedin.checked = s.sites.linkedin;
  siteX.checked = s.sites.x;
  minChars.value = String(s.minChars);
  await renderStats();
}

async function save() {
  await saveSettings({
    apiKey: apiKey.value.trim(),
    model: model.value.trim(),
    sites: { linkedin: siteLinkedin.checked, x: siteX.checked },
    minChars: Number(minChars.value) || 0,
  });
  flash('Saved.');
}

async function test() {
  await save();
  const s = await getSettings();
  if (!s.apiKey) return flash('Enter an API key first.');
  flash('Calling Jev…');
  testOut.hidden = false;
  testOut.textContent = '';
  const started = performance.now();
  try {
    const v = await classify({ apiKey: s.apiKey, model: s.model, platform: 'linkedin', text: SAMPLE_POST });
    const ms = Math.round(performance.now() - started);
    flash(`OK — ${ms} ms, $${v.cost.toFixed(6)}`);
    testOut.textContent = `Sample post →\n${JSON.stringify(v, null, 2)}`;
  } catch (err) {
    flash('Failed.');
    testOut.textContent = String(err);
  }
}

async function renderStats() {
  const st = await getStats();
  const rows: [string, string][] = [
    ['API calls', String(st.calls)],
    ['Cache hits', String(st.cacheHits)],
    ['Errors', String(st.errors)],
    ['Spend', `$${st.cost.toFixed(5)}`],
    ['Avg / call', st.calls ? `$${(st.cost / st.calls).toFixed(6)}` : '—'],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function flash(msg: string) {
  status.textContent = msg;
}

$('save').addEventListener('click', save);
$('test').addEventListener('click', test);
$('clearCache').addEventListener('click', async () => flash(`Cleared ${await clearCache()} cached verdicts.`));
$('resetStats').addEventListener('click', async () => {
  await resetStats();
  await renderStats();
});
chrome.storage.onChanged.addListener((c) => c.stats && renderStats());

void load();
