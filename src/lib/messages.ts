import type { PostState } from './questions';
import type { Verdict } from './score';

export type ClassifyRequest = {
  type: 'classify';
  platform: PostState['platform'];
  text: string;
  partial: boolean;
};

export type ClassifyResponse =
  | { ok: true; verdict: Verdict; cached: boolean }
  | { ok: false; error: string; code?: 'no_key' | 'api' };

export function sendClassify(req: Omit<ClassifyRequest, 'type'>): Promise<ClassifyResponse> {
  return chrome.runtime.sendMessage({ type: 'classify', ...req } satisfies ClassifyRequest);
}
