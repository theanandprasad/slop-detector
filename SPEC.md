# Slop Detector — Spec

A Chrome extension that tells you, for each post in your LinkedIn and X feeds, whether it's **worth your time** or **built to extract engagement**, using TypeSafe's **Jev** decision model via OpenRouter.

## Positioning

We judge **value and bait**, not **AI authorship** and not writing style. "Templated" turned out to be a weak stand-in: a formula post can still be useful, and a sincere rant is neither useful nor bait. AI-authorship detection is unreliable and unfair to non-native writers, so it's shown separately and never decides the badge. Labels describe what the post *gives* and *does*, never who wrote it.

## Decisions

| Decision | Choice |
|---|---|
| Distribution | Unpacked extension from a GitHub Release zip. No Web Store yet, no proxy. |
| API key | Bring-your-own OpenRouter key, stored in `chrome.storage.local`, used only by the service worker. |
| Default action | **Label** (badge on the post). No dimming/hiding yet. |
| Scope | LinkedIn + X **feed posts only**. Replies/comments later. |
| Model | `typesafe/jev-1.13`, pinned so tuned thresholds stay stable. |
| Feedback | 👍/👎 labels stay in the user's browser; never sent anywhere. |

## The verdict: two axes, four categories

|  | **Not bait** | **Bait** |
|---|---|---|
| **Useful** | 💎 Useful | 🟡 Useful, but baity |
| **Not useful** | ⚪ Casual (neutral: jokes, rants, updates) | 🔴 Bait |

## How Jev is used

Jev is a System One decision model: it answers typed questions (`noul` = yes/no probability, `choice`, `score`) with calibrated probabilities and **no text or explanations**. One request per post (questions answered in parallel), state `{ platform, kind, text }`:

| Question | Type | Role |
|---|---|---|
| `value` | score, 4 levels: nothing / platitude or moral (even told as a story) / non-obvious idea / actionable info | **Useful axis**: `P(useful) = P(level ≥ 2)`, or `P(level 3)` for formula posts |
| `intent` | choice: inform, opinion, personal, discussion, entertain, promote, farm_engagement, provoke | **Bait axis**: `P(bait intent) = P(farm_engagement) + P(provoke)` |
| `gated_value`, `unpaid_hook`, `engagement_ask`, `rage_bait`, `unverifiable_flex`, `staged_story`, `link_in_comments` | noul each | **Named bait tactics** |
| `formula` | noul | Raises the bar for useful (see below); never makes a post bait |
| `ai_style` | noul | Explanation only ("reads AI-written") |

Endpoint: `POST https://openrouter.ai/api/alpha/decisions` (alpha — wrapped in one client module). Cost: input tokens only, $0.042/M; well under $0.0001 per post.

## Scoring

- **Useful** if `P(useful) ≥ t.useful` (default 0.5), or within 0.15 below it with ≥ 2 local **value clues** (numbers with units, outside links, code). When Jev's `formula` ≥ 0.8, only actionable info (level 3) counts, so a formula story with a moral isn't "useful" just because Jev reads the moral as an idea.
- A **tactic fires** if Jev says ≥ 0.6, or a local **bait phrase** matches ("Comment X to get it", "DM me for", "link in comments", "Tag someone who", "Save this post", closing "Agree?", "That hit hard"). A phrase and its Jev tactic count once.
- **Bait** if ≥ 2 tactics fire, or 1 tactic fires and `P(bait intent) ≥ t.baitIntent` (default 0.5). So bait always has a named tactic, and one incidental tactic (a job post's "link in comments") isn't enough on its own.
- Formula tells and AI style never make a post bait; AI style never affects the category at all.

The cache stores raw Jev answers, so scoring changes apply to cached posts without new calls.

## Feedback and personal calibration

- Each badge has 👍/👎; 👎 asks which of the four categories is right. Labels are stored in `chrome.storage.local` under `fb:<sha256(text)>`, with the Jev answers they were given against.
- **Per-post override:** a labeled post always shows the user's label (also on reposts of the same text).
- **Threshold fitting:** after 15 labels from the current question version, `calibrate.ts` grid-searches `t.useful` and `t.baitIntent` by replaying saved answers locally, and adopts the result only if it agrees with more labels than the defaults. Shown on the options page.
- **Export:** the options page exports labels as eval JSONL, for tuning question wording with `npm run eval`.

## Pipeline

```
content script (per site adapter)
  └─ finds posts → waits until near viewport → extracts text
     └─ skip if < 80 chars
        └─ message → service worker
             ├─ cache hit (sha256 of model + question version + text) → saved answers
             └─ Jev call (queue: concurrency 4, retry 429/5xx w/ backoff) → cache answers
             └─ score with local checks + fitted thresholds → apply user label if any
  ◄─ badge in Shadow DOM; click → panel (value, intent, tactics, formula, AI, 👍/👎)
```

## Components

| Path | Role |
|---|---|
| `src/adapters/` | Per-site selectors: find posts, extract text, detect truncation, badge anchor, `shouldClassify` (skips replies). All brittle DOM knowledge lives here. |
| `src/entrypoints/content.ts` | MutationObserver + IntersectionObserver, badge lifecycle, feedback wiring. |
| `src/entrypoints/background.ts` | Classify + feedback handlers, cache, queue, stats. |
| `src/lib/jev.ts` | Typed Decisions API client (runtime-agnostic, shared with eval). |
| `src/lib/questions.ts` | The question set — main tuning lever. |
| `src/lib/heuristics.ts` | Local checks: bait phrases, value clues, formula tells, AI style. |
| `src/lib/score.ts` | Two-axis scoring → category. |
| `src/lib/feedback.ts`, `src/lib/calibrate.ts` | User labels and threshold fitting. |
| `src/entrypoints/options/` | API key, test call, site toggles, feedback/tuning status, export, stats. |
| `scripts/eval.ts` | Confusion matrix, per-axis and per-tactic stats, fitted thresholds, latency, cost. |

## Risks & mitigations

- **"Useful" is subjective** → per-user labels and threshold fitting; question wording tuned via eval.
- **Value in attachments** (LinkedIn carousels, videos, linked articles) is invisible to text-only Jev, so such posts can look like bait → next: adapters detect attachments and pass them in the state.
- **Privacy** → post text is sent to OpenRouter/TypeSafe; disclosed on options page. Messaging pages skipped. Labels never leave the browser.
- **DOM churn** → adapter layer with fallback selectors; failures are silent.
- **Truncated posts** (X "Show more") → classify visible text, mark `partial`.

## Roadmap

- **Now** — two-axis verdict, bait tactics, value clues, 👍/👎 with personal calibration.
- **Next** — attachment detection (LinkedIn documents/video/links); toolbar on/off switch; feed modes (dim bait, useful only) and a feed summary.
- **Later** — personal interests for "useful to me"; replies/comments; more sites; Chrome Web Store.
