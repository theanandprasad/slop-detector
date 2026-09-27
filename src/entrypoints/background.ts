import { cacheKey, getCached, putCached } from '@/lib/cache';
import { askJev, normalize, scoreResponse } from '@/lib/classify';
import { JevError } from '@/lib/jev';
import type { ClassifyRequest, ClassifyResponse } from '@/lib/messages';
import { TaskQueue } from '@/lib/queue';
import { bumpStats, getSettings } from '@/lib/settings';

export default defineBackground(() => {
  const queue = new TaskQueue(4);

  chrome.runtime.onMessage.addListener((msg: ClassifyRequest, _sender, sendResponse) => {
    if (msg?.type !== 'classify') return false;
    handleClassify(msg, queue).then(sendResponse);
    return true; // async response
  });

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') chrome.runtime.openOptionsPage();
  });
});

async function handleClassify(msg: ClassifyRequest, queue: TaskQueue): Promise<ClassifyResponse> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, code: 'no_key', error: 'Add your OpenRouter API key in the extension options.' };
  }

  const text = normalize(msg.text);
  const key = await cacheKey(settings.model, text);

  const cached = await getCached(key);
  if (cached) {
    void bumpStats({ cacheHits: 1 });
    return { ok: true, verdict: scoreResponse(cached, text, msg.partial), cached: true };
  }

  try {
    const res = await queue.run(key, () =>
      askJev({ apiKey: settings.apiKey, model: settings.model, platform: msg.platform, text }),
    );
    // Partial (truncated) text gets cached too; its hash differs from the full text's.
    await putCached(key, res);
    void bumpStats({ calls: 1, cost: res.usage?.cost ?? 0 });
    return { ok: true, verdict: scoreResponse(res, text, msg.partial), cached: false };
  } catch (err) {
    void bumpStats({ errors: 1 });
    const error = err instanceof JevError ? `Jev ${err.status}: ${err.message}` : String(err);
    return { ok: false, code: 'api', error };
  }
}
