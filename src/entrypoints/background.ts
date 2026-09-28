import { cacheKey, getCached, putCached } from '@/lib/cache';
import { askJev, normalize, scoreResponse } from '@/lib/classify';
import { getCalibration, getFeedback, recalibrate, saveFeedback } from '@/lib/feedback';
import { JevError } from '@/lib/jev';
import type { ClassifyRequest, ClassifyResponse, FeedbackRequest, FeedbackResponse } from '@/lib/messages';
import { QUESTIONS_VERSION } from '@/lib/questions';
import { TaskQueue } from '@/lib/queue';
import { applyUserLabel, type JevAnswers, type Verdict } from '@/lib/score';
import { bumpStats, getSettings } from '@/lib/settings';

export default defineBackground(() => {
  const queue = new TaskQueue(4);

  chrome.runtime.onMessage.addListener((msg: ClassifyRequest | FeedbackRequest, _sender, sendResponse) => {
    if (msg?.type === 'classify') {
      handleClassify(msg, queue).then(sendResponse);
      return true; // async response
    }
    if (msg?.type === 'feedback') {
      handleFeedback(msg).then(sendResponse);
      return true;
    }
    return false;
  });

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') chrome.runtime.openOptionsPage();
  });
});

/** Scores saved Jev answers with the user's fitted thresholds and their label for this post, if any. */
async function verdictFor(res: JevAnswers, text: string, partial: boolean): Promise<Verdict> {
  const calibration = await getCalibration();
  const verdict = scoreResponse(res, text, { partial, thresholds: calibration?.thresholds });
  const feedback = await getFeedback(text);
  return feedback ? applyUserLabel(verdict, feedback.label) : verdict;
}

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
    return { ok: true, verdict: await verdictFor(cached, text, msg.partial), cached: true };
  }

  try {
    const res = await queue.run(key, () =>
      askJev({ apiKey: settings.apiKey, model: settings.model, platform: msg.platform, text }),
    );
    // Partial (truncated) text gets cached too; its hash differs from the full text's.
    await putCached(key, res);
    void bumpStats({ calls: 1, cost: res.usage?.cost ?? 0 });
    return { ok: true, verdict: await verdictFor(res, text, msg.partial), cached: false };
  } catch (err) {
    void bumpStats({ errors: 1 });
    const error = err instanceof JevError ? `Jev ${err.status}: ${err.message}` : String(err);
    return { ok: false, code: 'api', error };
  }
}

async function handleFeedback(msg: FeedbackRequest): Promise<FeedbackResponse> {
  const settings = await getSettings();
  const text = normalize(msg.text);
  const res = await getCached(await cacheKey(settings.model, text));
  if (!res) return { ok: false, error: 'This post needs to be checked again first. Refresh the page and try again.' };

  const predicted = scoreResponse(res, text, { thresholds: (await getCalibration())?.thresholds }).predicted;
  await saveFeedback({
    platform: msg.platform,
    text,
    label: msg.label,
    predicted,
    res,
    version: QUESTIONS_VERSION,
    t: Date.now(),
  });
  await recalibrate();
  return { ok: true, verdict: await verdictFor(res, text, msg.partial) };
}
