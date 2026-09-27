# Slop Detector

Chrome extension that labels formulaic, low-effort writing on LinkedIn and X using TypeSafe's Jev decision model via OpenRouter. See [SPEC.md](SPEC.md) for the design.

## Run it

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `dist/chrome-mv3`.
The options page opens on install: paste your OpenRouter key, click **Test call**.

For development with hot reload: `npm run dev` (launches a Chrome instance with the extension loaded).

## Tune it

```bash
OPENROUTER_API_KEY=sk-or-... npm run eval
```

Runs the question set in `src/lib/questions.ts` over `eval/labeled.jsonl` (falls back to the 8-post example file) and prints precision/recall per threshold, how often each tell fires on slop vs. clean posts, latency, and cost. Adjust thresholds in `src/lib/score.ts`.

## Layout

- `src/adapters/` — per-site DOM selectors (fix these when LinkedIn/X change markup)
- `src/lib/` — Jev client, question set, heuristics, scoring, cache, queue
- `src/entrypoints/` — background service worker, content script, options page
- `src/ui/badge.ts` — Shadow DOM badge
