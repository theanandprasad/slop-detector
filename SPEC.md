# Slop Detector — Spec

A Chrome extension that labels formulaic, low-effort "AI slop" writing in your LinkedIn and X feeds, using TypeSafe's **Jev** decision model via OpenRouter.

## Positioning

We score **slop**, not **AI authorship**. AI-authorship detection is unreliable and unfair to non-native writers and people who polish with AI. What readers actually mind is templated, generic, engagement-bait writing. Labels describe the *writing pattern* ("templated hook, engagement bait, no specifics"), never the author.

## Decisions (locked for v0.1)

| Decision | Choice |
|---|---|
| Distribution | Personal extension, loaded unpacked. No Web Store, no proxy. |
| API key | Bring-your-own OpenRouter key, stored in `chrome.storage.local`, used only by the service worker. |
| Default action | **Label** (badge on the post). No dimming/hiding in v0.1. |
| Scope | LinkedIn + X **feed posts only**. Replies/comments are v0.2. |
| Model | `typesafe/jev-1.13`, pinned so tuned thresholds stay stable. |

## How Jev is used

Jev is a System One decision model: it answers typed questions (`noul` = yes/no probability, `choice`, `score`) with calibrated probabilities and **no text or explanations**. So we get explainability by decomposing slop into named tells:

- `slop` (score, 4 levels): overall formulaic-ness → the headline number.
- One `noul` per tell: `no_specifics`, `engagement_bait`, `contrast_framing`, `manufactured_story`, `broetry`, `buzzword_voice`, `hook_formula`.

Plus a separate `ai_style` noul ("Does this read as AI-generated?") and local AI-style phrase checks (em-dash density, "Here's why:", "Let's dive in", AI vocabulary, emoji section headers). This **AI read is informational only**: it's shown as its own panel line and never affects the tier or counts as a signal, because AI-authorship judgments are unreliable. Validate it with posts of known origin (`"ai": 0|1` in the eval set) before trusting it.

All questions go in **one request per post** (answered in parallel). State is `{ platform, kind, text }`.

Endpoint: `POST https://openrouter.ai/api/alpha/decisions` (alpha — wrapped in one client module).

Cost: input tokens only, $0.042/M. ~700 tokens/post ≈ $0.00003. 2k posts/day ≈ $2/month.

## Pipeline

```
content script (per site adapter)
  └─ finds posts → waits until near viewport → extracts text
     └─ skip if < 80 chars
        └─ message → service worker
             ├─ cache hit (sha256 of normalized text) → return
             ├─ local heuristics (phrases, emoji bullets, line-break ratio, hashtags)
             └─ Jev call (queue: concurrency 4, retry 429/5xx w/ backoff)
                  └─ combine → { score 0..1, tier, tells[], heuristics[] } → cache
  ◄─ badge rendered in Shadow DOM; click → popover of fired tells
```

**Scoring:** Jev's `slop` answer is a probability per level. `score = P(level 2) + P(level 3)` (probability the post is a template); it's the number on the badge. Tiers: 🟡 needs `≥ 0.5` **and** at least 1 signal; 🔴 needs `≥ 0.8` **and** at least 2 distinct signals (fired patterns + phrase hits; a phrase and its matching pattern count once; `no_specifics` is shown as context but never counted, since it fires on almost any aphorism, opinion or joke). With too few signals the tier is lowered, so a colored badge always has a named reason. Local phrase checks never move the score; they only count as signals. A pattern fires at `noul ≥ 0.6`. All thresholds are placeholders until tuned on labeled data. The cache stores raw Jev answers, so scoring changes apply to cached posts without new calls.

## Components

| Path | Role |
|---|---|
| `src/adapters/` | Per-site selectors: find posts, extract text, detect truncation, badge anchor, `shouldClassify` (skips replies). All brittle DOM knowledge lives here. |
| `src/entrypoints/content.ts` | MutationObserver + IntersectionObserver, badge lifecycle (re-attaches if the site re-renders). |
| `src/entrypoints/background.ts` | Message handler, cache, queue, stats. |
| `src/lib/jev.ts` | Typed Decisions API client (runtime-agnostic, shared with eval). |
| `src/lib/questions.ts` | The question set — main tuning lever. |
| `src/lib/heuristics.ts` | Free local signals. |
| `src/lib/score.ts` | Combiner + tiers. |
| `src/entrypoints/options/` | API key, test call (latency + cost), site toggles, stats, clear cache. |
| `scripts/eval.ts` | Runs the question set over `eval/labeled.jsonl`, prints precision/recall per threshold, per-tell rates, latency, cost. |

## Calibration loop

1. Hand-label ~200 posts (100 LinkedIn, 100 X) into `eval/labeled.jsonl`.
2. `npm run eval` → pick tier thresholds and tell threshold.
3. Iterate on question wording in `questions.ts` (biggest lever), re-run.

## Risks & mitigations

- **False positives** on non-native writers → label-only, pattern wording, never "AI-written".
- **Privacy** → post text is sent to OpenRouter/TypeSafe; disclosed on options page. Content script never matches messaging pages.
- **DOM churn** → adapter layer with fallback selectors; failures are silent.
- **Truncated posts** (X "Show more") → classify visible text, mark `partial`. Image-only posts are skipped (Jev is text-only).
- **Latency unknown** → async badge (spinner → result); measured via the options test button and eval script.

## Roadmap

- **v0.1** — LinkedIn + X feed posts, BYOK, label mode, tells popover, cache, options page, eval script.
- **v0.2** — X replies + LinkedIn comments (reply-bot question), dim/hide modes, 👍/👎 feedback → eval set, feed stats popup.
- **v0.3** — More adapters (Reddit, Substack, Medium, generic article), proxy backend if publishing.
