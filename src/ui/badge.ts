// Badge rendered in a Shadow DOM so the host site's CSS can't touch it (and vice versa).
// Expands inline rather than as a floating popover, which avoids clipping inside
// overflow:hidden feed cards.

import { SLOP_LEVEL_NAMES, TEMPLATE_LEVEL } from '@/lib/questions';
import { MIN_SIGNALS, type Verdict } from '@/lib/score';

export const BADGE_TAG = 'slop-detector-badge';

const STYLE = `
:host { all: initial; display: block; margin: 4px 0 6px; font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.wrap { color: var(--fg); }
button.pill {
  all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 9px; border-radius: 999px; font-weight: 600; font-size: 11.5px;
  border: 1px solid var(--c); color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent);
}
button.pill:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.light { --fg: #0f1419; --panel: rgba(0, 0, 0, .03); }
.light.clean { --c: #1a7f47; } .light.some { --c: #a36800; } .light.slop { --c: #c92a2a; } .light.muted { --c: #6b7280; }
.dark { --fg: #e7e9ea; --panel: rgba(255, 255, 255, .04); }
.dark.clean { --c: #3ecf8e; } .dark.some { --c: #f5b53d; } .dark.slop { --c: #ff6b6b; } .dark.muted { --c: #9aa0a6; }
.spin { width: 8px; height: 8px; border: 1.5px solid var(--c); border-right-color: transparent; border-radius: 50%; animation: s .8s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
.panel {
  margin-top: 6px; padding: 8px 10px; border-radius: 8px; max-width: 420px; color: var(--fg);
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  background: linear-gradient(color-mix(in srgb, var(--c) 8%, transparent), color-mix(in srgb, var(--c) 8%, transparent)), var(--panel);
}
.panel h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .75; }
.panel ul { margin: 0 0 6px; padding-left: 16px; }
.panel li { margin: 1px 0; }
.meta { opacity: .7; font-size: 11px; }
.note { margin: 0 0 8px; font-size: 11.5px; opacity: .85; }
.levels { display: grid; grid-template-columns: max-content 1fr 3.2em; gap: 3px 8px; align-items: center; margin: 0 0 8px; font-size: 11.5px; }
.levels .name.tpl { font-weight: 600; }
.bar { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; }
.bar > i { display: block; height: 100%; background: color-mix(in srgb, var(--fg) 45%, transparent); }
.bar.tpl > i { background: var(--c); }
.ai { margin: 8px 0 6px; padding-top: 8px; border-top: 1px dashed color-mix(in srgb, var(--fg) 20%, transparent); }
.ai h4 { display: flex; gap: 6px; align-items: baseline; }
.ai-pct { font-size: 12px; letter-spacing: 0; text-transform: none; opacity: 1; font-weight: 700; }
.ai-note { margin: 0 0 4px; }
.levels .pct { text-align: right; font-variant-numeric: tabular-nums; opacity: .8; }
`;

type BadgeState =
  | { kind: 'loading' }
  | { kind: 'verdict'; verdict: Verdict; cached: boolean }
  | { kind: 'error'; message: string };

const TIER_TEXT = { clean: 'Clean', some: 'Some slop', slop: 'Slop' } as const;

export function createBadge(): { host: HTMLElement; update(state: BadgeState): void; refresh(): void } {
  const host = document.createElement(BADGE_TAG);
  const root = host.attachShadow({ mode: 'open' });
  let open = false;
  let current: BadgeState = { kind: 'loading' };

  // Keep clicks on the badge from opening the post (both sites navigate on card click).
  host.addEventListener('click', (e) => e.stopPropagation());

  function render() {
    const s = current;
    let cls = 'muted';
    let pillInner = '';
    let panel = '';

    if (s.kind === 'loading') {
      pillInner = `<span class="spin"></span>Checking…`;
    } else if (s.kind === 'error') {
      pillInner = `<span class="dot"></span>Slop check failed`;
      panel = `<div class="panel">${esc(s.message)}</div>`;
    } else {
      const v = s.verdict;
      cls = v.tier;
      pillInner = `<span class="dot"></span>${TIER_TEXT[v.tier]} · ${Math.round(v.score * 100)}`;
      const tells = v.tells.map((t) => `<li>${esc(t.label)} <span class="meta">${Math.round(t.p * 100)}%${t.counted === false ? ' · context, not counted' : ''}</span></li>`).join('');
      const heur = v.heuristics.map((h) => `<li>${esc(h)}</li>`).join('');
      const levels = (v.levels ?? [])
        .map((p, i) => {
          const tpl = i >= TEMPLATE_LEVEL ? ' tpl' : '';
          const pct = Math.round(p * 100);
          return `<span class="name${tpl}">${esc(SLOP_LEVEL_NAMES[i] ?? `Level ${i}`)}</span><span class="bar${tpl}"><i style="width:${pct}%"></i></span><span class="pct">${pct}%</span>`;
        })
        .join('');
      const note = v.capped
        ? `<p class="note">Held at ${TIER_TEXT[v.tier]}: Jev alone leans ${TIER_TEXT[v.jevTier]}, but it has ${v.signals} supporting signal${v.signals === 1 ? '' : 's'} (${TIER_TEXT[v.jevTier]} needs ${MIN_SIGNALS[v.jevTier as 'some' | 'slop']}).</p>`
        : '';
      panel = `<div class="panel">
        ${note}
        <h4>Jev's read</h4>
        <div class="levels">${levels}</div>
        ${tells ? `<h4>Patterns</h4><ul>${tells}</ul>` : '<h4>No strong patterns</h4>'}
        ${heur ? `<h4>Phrases</h4><ul>${heur}</ul>` : ''}
        ${aiSection(v)}
        <div class="meta">P(template) ${Math.round(v.score * 100)}% · ${v.signals} signal${v.signals === 1 ? '' : 's'} · avg level ${v.jevScore.toFixed(2)}/3${v.partial ? ' · truncated text' : ''}${s.cached ? ' · cached' : ''}</div>
      </div>`;
    }

    root.innerHTML = `<style>${STYLE}</style>
      <div class="wrap ${readTheme(host)} ${cls}" style="${fgStyle(host)}">
        <button class="pill" aria-expanded="${open}" title="Slop Detector">${pillInner}</button>
        ${open ? panel : ''}
      </div>`;
    root.querySelector('button')?.addEventListener('click', () => {
      if (current.kind === 'loading') return;
      open = !open;
      render();
    });
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

// The AI read is deliberately separated from the slop verdict above it.
function aiSection(v: Verdict): string {
  const ai = v.ai;
  if (!ai || (ai.p === null && ai.hits.length === 0)) return '';
  const pct = ai.p === null ? '' : `<span class="ai-pct">${Math.round(ai.p * 100)}%</span>`;
  const hits = ai.hits.length ? `<ul>${ai.hits.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
  return `<div class="ai">
    <h4>Reads AI-written ${pct}</h4>
    <p class="meta ai-note">Separate from the badge; AI detection is unreliable.</p>
    ${hits}
  </div>`;
}

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
