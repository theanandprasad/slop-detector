// Badge rendered in a Shadow DOM so the host site's CSS can't touch it (and vice versa).
// Expands inline rather than as a floating popover, which avoids clipping inside
// overflow:hidden feed cards.

import { USEFUL_LEVEL, VALUE_LEVEL_NAMES } from '@/lib/questions';
import { CATEGORIES, type Category, type Verdict } from '@/lib/score';

export const BADGE_TAG = 'slop-detector-badge';

export const CATEGORY_TEXT: Record<Category, string> = {
  useful: 'Useful',
  casual: 'Casual',
  baity: 'Useful, but baity',
  bait: 'Bait',
};

const STYLE = `
:host { all: initial; display: block; margin: 4px 0 6px; font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.wrap { color: var(--fg); }
button { font: inherit; }
button.pill {
  all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 9px; border-radius: 999px; font-weight: 600; font-size: 11.5px;
  border: 1px solid var(--c); color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent);
}
button.pill:focus-visible, .fb button:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.light { --fg: #0f1419; --panel: rgba(0, 0, 0, .03); }
.light.useful { --c: #1a7f47; } .light.baity { --c: #a36800; } .light.bait { --c: #c92a2a; } .light.casual, .light.muted { --c: #6b7280; }
.dark { --fg: #e7e9ea; --panel: rgba(255, 255, 255, .04); }
.dark.useful { --c: #3ecf8e; } .dark.baity { --c: #f5b53d; } .dark.bait { --c: #ff6b6b; } .dark.casual, .dark.muted { --c: #9aa0a6; }
.spin { width: 8px; height: 8px; border: 1.5px solid var(--c); border-right-color: transparent; border-radius: 50%; animation: s .8s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
.panel {
  margin-top: 6px; padding: 8px 10px; border-radius: 8px; max-width: 440px; color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  background: linear-gradient(color-mix(in srgb, var(--c) 8%, transparent), color-mix(in srgb, var(--c) 8%, transparent)), var(--panel);
}
.panel h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .75; display: flex; gap: 6px; align-items: baseline; }
.panel ul { margin: 0 0 8px; padding-left: 16px; }
.panel li { margin: 1px 0; }
.meta { opacity: .7; font-size: 11px; }
.note { margin: 0 0 8px; font-size: 11.5px; opacity: .9; }
.levels { display: grid; grid-template-columns: max-content 1fr 3.2em; gap: 3px 8px; align-items: center; margin: 0 0 6px; font-size: 11.5px; }
.levels .name.hl { font-weight: 600; }
.levels .pct { text-align: right; font-variant-numeric: tabular-nums; opacity: .8; }
.bar { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; }
.bar > i { display: block; height: 100%; background: color-mix(in srgb, var(--fg) 45%, transparent); }
.bar.hl > i { background: var(--c); }
.intents { margin: 0 0 8px; font-size: 11.5px; }
.intents b { font-weight: 600; }
.section { margin: 8px 0 6px; padding-top: 8px; border-top: 1px dashed color-mix(in srgb, var(--fg) 20%, transparent); }
.pct-strong { font-size: 12px; letter-spacing: 0; text-transform: none; opacity: 1; font-weight: 700; }
.fb { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 6px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--fg) 15%, transparent); font-size: 11.5px; }
.fb button {
  all: unset; cursor: pointer; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;
  border: 1px solid color-mix(in srgb, var(--fg) 25%, transparent);
}
.fb button:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); }
`;

type BadgeState =
  | { kind: 'loading' }
  | { kind: 'verdict'; verdict: Verdict; cached: boolean }
  | { kind: 'error'; message: string };

type FeedbackStage = { kind: 'idle' } | { kind: 'choose' } | { kind: 'saving' } | { kind: 'done'; message: string };

export type FeedbackHandler = (label: Category) => Promise<{ ok: true; verdict: Verdict } | { ok: false; error: string }>;

export function createBadge(opts: { onFeedback?: FeedbackHandler } = {}): {
  host: HTMLElement;
  update(state: BadgeState): void;
  refresh(): void;
} {
  const host = document.createElement(BADGE_TAG);
  const root = host.attachShadow({ mode: 'open' });
  let open = false;
  let current: BadgeState = { kind: 'loading' };
  let fb: FeedbackStage = { kind: 'idle' };

  // Keep clicks on the badge from opening the post (both sites navigate on card click).
  host.addEventListener('click', (e) => e.stopPropagation());

  async function giveFeedback(label: Category) {
    if (!opts.onFeedback || current.kind !== 'verdict') return;
    fb = { kind: 'saving' };
    render();
    const res = await opts.onFeedback(label).catch((err) => ({ ok: false as const, error: String(err) }));
    if (res.ok) {
      current = { ...current, verdict: res.verdict };
      fb = { kind: 'done', message: 'Saved. Stored only in this browser.' };
    } else {
      fb = { kind: 'done', message: res.error };
    }
    render();
  }

  function render() {
    const s = current;
    let cls = 'muted';
    let pillInner = '';
    let panel = '';

    if (s.kind === 'loading') {
      pillInner = `<span class="spin"></span>Checking…`;
    } else if (s.kind === 'error') {
      pillInner = `<span class="dot"></span>Check failed`;
      panel = `<div class="panel">${esc(s.message)}</div>`;
    } else {
      const v = s.verdict;
      cls = v.category;
      pillInner = `<span class="dot"></span>${CATEGORY_TEXT[v.category]}${v.userLabel ? ' · your label' : ''}`;
      panel = `<div class="panel">
        ${labelNote(v)}
        ${valueSection(v)}
        ${intentSection(v)}
        ${tacticSection(v)}
        ${formulaSection(v)}
        ${aiSection(v)}
        ${opts.onFeedback ? feedbackRow(v, fb) : ''}
        <div class="meta">P(useful) ${pct(v.pUseful)} · P(bait intent) ${pct(v.pBaitIntent)}${v.partial ? ' · truncated text' : ''}${s.cached ? ' · cached' : ''}</div>
      </div>`;
    }

    root.innerHTML = `<style>${STYLE}</style>
      <div class="wrap ${readTheme(host)} ${cls}" style="${fgStyle(host)}">
        <button class="pill" aria-expanded="${open}" title="Slop Detector">${pillInner}</button>
        ${open ? panel : ''}
      </div>`;

    root.querySelector('button.pill')?.addEventListener('click', () => {
      if (current.kind === 'loading') return;
      open = !open;
      if (!open) fb = { kind: 'idle' };
      render();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-fb]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const action = btn.dataset.fb!;
        if (action === 'up' && current.kind === 'verdict') void giveFeedback(current.verdict.category);
        else if (action === 'down' || action === 'change') {
          fb = { kind: 'choose' };
          render();
        } else if ((CATEGORIES as string[]).includes(action)) void giveFeedback(action as Category);
      }),
    );
  }

  render();
  return {
    host,
    update(state) {
      current = state;
      render();
    },
    /** Re-render after mounting or a page theme change. */
    refresh: render,
  };
}

// ── Panel sections ───────────────────────────────────────────────────────────

function labelNote(v: Verdict): string {
  if (!v.userLabel) return '';
  return v.overridden
    ? `<p class="note">You labeled this <b>${CATEGORY_TEXT[v.userLabel]}</b>. The model said ${CATEGORY_TEXT[v.predicted]}.</p>`
    : `<p class="note">You confirmed this label.</p>`;
}

function valueSection(v: Verdict): string {
  const rows = v.valueLevels
    .map((p, i) => {
      const hl = i >= (v.usefulFrom ?? USEFUL_LEVEL) ? ' hl' : '';
      return `<span class="name${hl}">${esc(VALUE_LEVEL_NAMES[i] ?? `Level ${i}`)}</span><span class="bar${hl}"><i style="width:${Math.round(p * 100)}%"></i></span><span class="pct">${pct(p)}</span>`;
    })
    .join('');
  const clues = v.valueClues.length ? `<ul>${v.valueClues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  const strict =
    (v.usefulFrom ?? USEFUL_LEVEL) > USEFUL_LEVEL
      ? `<p class="meta note">Written as a formula, so only actionable info counts as useful.</p>`
      : '';
  return `<h4>What you get</h4><div class="levels">${rows}</div>${strict}${clues}`;
}

function intentSection(v: Verdict): string {
  const top = v.intents.filter((i) => i.p >= 0.05).slice(0, 3);
  if (!top.length) return '';
  const items = top.map((i, n) => (n === 0 ? `<b>${esc(i.label)}</b> ${pct(i.p)}` : `${esc(i.label)} ${pct(i.p)}`));
  return `<h4>What it's trying to do</h4><div class="intents">${items.join(' · ')}</div>`;
}

function tacticSection(v: Verdict): string {
  if (!v.tactics.length) return '<h4>No bait tactics</h4>';
  const items = v.tactics
    .map((t) => {
      const detail = [t.p !== null ? pct(t.p) : '', t.phrases.join(', ')].filter(Boolean).join(' · ');
      return `<li>${esc(t.label)} <span class="meta">${esc(detail)}</span></li>`;
    })
    .join('');
  return `<h4>Bait tactics</h4><ul>${items}</ul>`;
}

function formulaSection(v: Verdict): string {
  const f = v.formula;
  if ((f.p === null || f.p < 0.6) && !f.hits.length) return '';
  const p = f.p === null ? '' : `<span class="pct-strong">${pct(f.p)}</span>`;
  const hits = f.hits.length ? `<ul>${f.hits.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  return `<div class="section"><h4>Written as a formula ${p}</h4><p class="meta note">Never makes a post bait; at 80%+ it needs actionable info to count as useful.</p>${hits}</div>`;
}

// The AI read is deliberately separated from the verdict above it.
function aiSection(v: Verdict): string {
  const ai = v.ai;
  if (ai.p === null && !ai.hits.length) return '';
  const p = ai.p === null ? '' : `<span class="pct-strong">${pct(ai.p)}</span>`;
  const hits = ai.hits.length ? `<ul>${ai.hits.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  return `<div class="section"><h4>Reads AI-written ${p}</h4><p class="meta note">Doesn't affect the badge; AI detection is unreliable.</p>${hits}</div>`;
}

function feedbackRow(v: Verdict, stage: FeedbackStage): string {
  if (stage.kind === 'saving') return `<div class="fb">Saving…</div>`;
  if (stage.kind === 'choose') {
    const choices = (Object.keys(CATEGORY_TEXT) as Category[])
      .map((c) => `<button data-fb="${c}">${CATEGORY_TEXT[c]}</button>`)
      .join('');
    return `<div class="fb">What is it? ${choices}</div>`;
  }
  const done = stage.kind === 'done' ? `<span class="meta">${esc(stage.message)}</span>` : '';
  if (v.userLabel) {
    return `<div class="fb">Your label: <b>${CATEGORY_TEXT[v.userLabel]}</b> <button data-fb="change">Change</button> ${done}</div>`;
  }
  return `<div class="fb">Right call? <button data-fb="up" title="Yes">👍</button><button data-fb="down" title="No">👎</button> ${done}</div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const pct = (p: number) => `${Math.round(p * 100)}%`;

// Match the page: take the post's own text color, and infer dark mode from it
// (light text ⇒ dark background). Read on every render so theme switches apply.
function postTextColor(host: HTMLElement): string | null {
  const ref = (host.nextElementSibling ?? host.parentElement) as HTMLElement | null;
  return ref ? getComputedStyle(ref).color : null;
}

function readTheme(host: HTMLElement): 'dark' | 'light' {
  const rgb = postTextColor(host)?.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!rgb || rgb.length < 3) {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const [r, g, b] = rgb as [number, number, number];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? 'dark' : 'light';
}

function fgStyle(host: HTMLElement): string {
  const color = postTextColor(host);
  return color ? `--fg: ${color}` : '';
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
