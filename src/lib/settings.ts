import { DEFAULT_MODEL } from './jev';

export type Settings = {
  apiKey: string;
  model: string;
  sites: { linkedin: boolean; x: boolean };
  minChars: number;
};

export type Stats = {
  calls: number;
  cacheHits: number;
  errors: number;
  cost: number;
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: DEFAULT_MODEL,
  sites: { linkedin: true, x: true },
  minChars: 80,
};

const EMPTY_STATS: Stats = { calls: 0, cacheHits: 0, errors: 0, cost: 0 };

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getStats(): Promise<Stats> {
  const { stats } = await chrome.storage.local.get('stats');
  return { ...EMPTY_STATS, ...(stats as Partial<Stats> | undefined) };
}

// Serialize stat updates so concurrent classifications don't clobber each other.
let statsChain = Promise.resolve();

export function bumpStats(delta: Partial<Stats>): Promise<void> {
  statsChain = statsChain.then(async () => {
    const s = await getStats();
    for (const k of Object.keys(delta) as (keyof Stats)[]) s[k] += delta[k] ?? 0;
    await chrome.storage.local.set({ stats: s });
  });
  return statsChain;
}

export async function resetStats(): Promise<void> {
  await chrome.storage.local.set({ stats: EMPTY_STATS });
}
