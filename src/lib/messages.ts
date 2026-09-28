import type { Platform } from './questions';
import type { Category, Verdict } from './score';

export type ClassifyRequest = {
  type: 'classify';
  platform: Platform;
  text: string;
  partial: boolean;
};

export type ClassifyResponse =
  | { ok: true; verdict: Verdict; cached: boolean }
  | { ok: false; error: string; code?: 'no_key' | 'api' };

export type FeedbackRequest = {
  type: 'feedback';
  platform: Platform;
  text: string;
  partial: boolean;
  label: Category;
};

export type FeedbackResponse = { ok: true; verdict: Verdict } | { ok: false; error: string };

export function sendClassify(req: Omit<ClassifyRequest, 'type'>): Promise<ClassifyResponse> {
  return chrome.runtime.sendMessage({ type: 'classify', ...req } satisfies ClassifyRequest);
}

export function sendFeedback(req: Omit<FeedbackRequest, 'type'>): Promise<FeedbackResponse> {
  return chrome.runtime.sendMessage({ type: 'feedback', ...req } satisfies FeedbackRequest);
}
