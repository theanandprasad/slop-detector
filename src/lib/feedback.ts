// The user's own 👍/👎 labels, stored only in this browser (chrome.storage.local).
// Keyed by post text alone, so a label keeps applying across model and question
// changes. Each entry also keeps the Jev answers it was given against, which is
// what calibration replays.

import { sha256Hex } from './cache';
import { fitThresholds, MIN_LABELS_TO_CALIBRATE, type Fit } from './calibrate';
import { QUESTIONS_VERSION, type Platform } from './questions';
import type { Category, JevAnswers } from './score';

const PREFIX = 'fb:';

export type FeedbackEntry = {
  platform: Platform;
  text: string;
  label: Category;
  predicted: Category;
  res: JevAnswers;
  /** QUESTIONS_VERSION the saved answers came from; only current ones are used for calibration. */
  version: number;
  t: number;
};

export type Calibration = Fit & { at: number };

const keyFor = async (text: string) => PREFIX + (await sha256Hex(text));

export async function getFeedback(text: string): Promise<FeedbackEntry | undefined> {
  const key = await keyFor(text);
  return (await chrome.storage.local.get(key))[key] as FeedbackEntry | undefined;
}

export async function saveFeedback(entry: FeedbackEntry): Promise<void> {
  await chrome.storage.local.set({ [await keyFor(entry.text)]: entry });
}

export async function allFeedback(): Promise<FeedbackEntry[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([, v]) => v as FeedbackEntry)
    .sort((a, b) => a.t - b.t);
}

export async function clearFeedback(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(PREFIX)));
  await chrome.storage.local.remove('calibration');
}

export async function getCalibration(): Promise<Calibration | null> {
  const { calibration } = await chrome.storage.local.get('calibration');
  return (calibration as Calibration | undefined) ?? null;
}

/** Re-fits thresholds to all current-version labels; null until there are enough. */
export async function recalibrate(): Promise<Calibration | null> {
  const usable = (await allFeedback()).filter((e) => e.version === QUESTIONS_VERSION);
  if (usable.length < MIN_LABELS_TO_CALIBRATE) {
    await chrome.storage.local.remove('calibration');
    return null;
  }
  const calibration: Calibration = { ...fitThresholds(usable), at: Date.now() };
  await chrome.storage.local.set({ calibration });
  return calibration;
}
