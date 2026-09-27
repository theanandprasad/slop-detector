# Slop Detector

A Chrome extension that labels templated, engagement-farming posts ("slop") in your **LinkedIn** and **X** feeds. Each post gets a small badge; click it to see why.

| Badge | Meaning |
|---|---|
| 🟢 **Clean** | Written in the author's own voice |
| 🟡 **Some slop** | Leans toward a formula, with at least one named pattern |
| 🔴 **Slop** | A reusable engagement formula (hook → lesson/list → "Agree? ♻️"), backed by at least two named patterns |

It judges the *writing pattern*, not who wrote it. A human-written formula post can be 🔴, and a well-edited AI draft can be 🟢. The panel also shows a separate "Reads AI-written" estimate, which never affects the badge (AI detection is unreliable).

Posts are scored by [Jev](https://openrouter.ai/typesafe/jev-1.13), TypeSafe's decision model, through [OpenRouter](https://openrouter.ai). You bring your own OpenRouter API key.

## Install

You'll need Chrome (or another Chromium browser: Edge, Brave, Arc) and an OpenRouter account.

1. **Download** [`slop-detector-chrome.zip`](https://github.com/theanandprasad/slop-detector/releases/latest/download/slop-detector-chrome.zip) from the [latest release](https://github.com/theanandprasad/slop-detector/releases/latest).
2. **Unzip it** into a folder you'll keep, e.g. `Documents/slop-detector`. Chrome loads the extension from this folder, so don't delete it.
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).

The extension isn't on the Chrome Web Store yet, which is why it's installed this way. Chrome may occasionally remind you that a developer-mode extension is installed; that's expected.

## Set up

The options page opens automatically after install. To open it later: right-click the extension's icon → **Options**.

1. Create an API key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) and add a few dollars of credit at [openrouter.ai/credits](https://openrouter.ai/credits).
2. Paste the key into the options page and click **Save**.
3. Click **Test call**. You should see `OK — … ms` and a sample verdict. If not, the error tells you why (see [Troubleshooting](#troubleshooting)).

## Use

Open or refresh LinkedIn or X and scroll. A badge appears above each post's text as it comes into view:

- **Click the badge** to see Jev's read (how likely the post is a formula), which patterns fired, which phrases matched, and the separate AI-written estimate.
- **Short posts** (under 80 characters) are skipped. You can change this on the options page.
- On X, only the main post on a thread page is checked, not the replies.

**Turning it off:** uncheck LinkedIn or X on the options page and refresh the tab, or switch the extension off in `chrome://extensions`.

## Cost

Jev charges only for input tokens, at $0.042 per million. A post costs well under $0.0001, so roughly 5–10 cents per 1,000 posts. Posts you've already seen are cached and cost nothing to show again. The options page shows your actual calls and spend.

## Privacy

- The text of posts you scroll past is sent to OpenRouter, which routes it to TypeSafe for scoring. Only the post text and the site name (LinkedIn or X) are sent, not the author, your profile, or your browsing history.
- Your API key is stored only in your browser and sent only to openrouter.ai.
- Messages and DMs are never checked: the extension skips LinkedIn and X messaging pages.
- There is no analytics or telemetry.

## Update

Download the new zip, unzip it **over the same folder** (replacing the old files), then click the reload icon on Slop Detector in `chrome://extensions`. Using the same folder keeps your API key and settings.

## Troubleshooting

| Problem | Fix |
|---|---|
| No badges at all | Refresh the page. If they still don't appear, LinkedIn or X may have changed their page layout. Please [open an issue](https://github.com/theanandprasad/slop-detector/issues). |
| Badge says "Slop check failed" | Click it to see the error. `401`: wrong API key. `402`: add OpenRouter credits. `400`/`404`: check the model name is `typesafe/jev-1.13`. |
| "Extension context invalidated" | The extension was reloaded; refresh the page. |
| A badge you disagree with | [Open an issue](https://github.com/theanandprasad/slop-detector/issues) with the post text and the badge. These examples are how the scoring gets tuned. |

## Limitations

This is an early version (v0.1):

- Feed posts only; comments and replies aren't checked yet.
- Scoring thresholds are still being tuned, so expect some misjudged posts.
- Built and tested for English posts.
- Relies on LinkedIn's and X's page structure, which can change without notice.

---

## For developers

See [SPEC.md](SPEC.md) for the design.

### Build

```bash
npm install
npm run build
```

Then load `dist/chrome-mv3` with **Load unpacked** as above. For hot reload during development: `npm run dev`. To build the release zip: `npm run zip`.

### Tune

```bash
OPENROUTER_API_KEY=sk-or-... npm run eval
```

Runs the question set in `src/lib/questions.ts` over `eval/labeled.jsonl` (falls back to the 8-post example file) and prints precision/recall per threshold, how often each pattern fires on slop vs. clean posts, latency, and cost. Adjust thresholds in `src/lib/score.ts`.

### Layout

- `src/adapters/`: per-site DOM selectors (fix these when LinkedIn or X change their markup)
- `src/lib/`: Jev client, question set, heuristics, scoring, cache, queue
- `src/entrypoints/`: background service worker, content script, options page
- `src/ui/badge.ts`: Shadow DOM badge

## License

[MIT](LICENSE)
