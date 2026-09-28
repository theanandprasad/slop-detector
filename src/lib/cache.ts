// Cache of raw Jev answers in chrome.storage.local, keyed by sha256 of
// (model + question version + normalized text). Reposts and feed refreshes hit the
// cache instead of the API. We store Jev's answers rather than finished verdicts,
// so scoring/threshold changes apply to cached posts without new API calls.

import { QUESTIONS_VERSION } from './questions';
import type { JevAnswers } from './score';

const PREFIX = 'v:';
const MAX_ENTRIES = 5000;
const PRUNE_TO = 4000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = { res: JevAnswers; t: number };

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function cacheKey(model: string, text: string): Promise<string> {
  return PREFIX + (await sha256Hex(`${model}\nq${QUESTIONS_VERSION}\n${text}`));
}

export async function getCached(key: string): Promise<JevAnswers | undefined> {
  const got = await chrome.storage.local.get(key);
  const entry = got[key] as Partial<Entry> | undefined;
  // Entries from older versions stored finished verdicts (no `res`): treat as a miss.
  if (!entry?.res || !entry.t || Date.now() - entry.t > TTL_MS) return undefined;
  return entry.res;
}

let writesSincePrune = 0;

export async function putCached(key: string, res: JevAnswers): Promise<void> {
  await chrome.storage.local.set({ [key]: { res, t: Date.now() } satisfies Entry });
  if (++writesSincePrune >= 200) {
    writesSincePrune = 0;
    await prune();
  }
}

async function prune(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all).filter(([k]) => k.startsWith(PREFIX)) as [string, Entry][];
  if (entries.length <= MAX_ENTRIES) return;
  entries.sort((a, b) => a[1].t - b[1].t);
  await chrome.storage.local.remove(entries.slice(0, entries.length - PRUNE_TO).map(([k]) => k));
}

export async function clearCache(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  await chrome.storage.local.remove(keys);
  return keys.length;
}
