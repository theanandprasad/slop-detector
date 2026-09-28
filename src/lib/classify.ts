import { runLocalChecks } from './heuristics';
import { decide } from './jev';
import { buildQuestions, type Platform, type PostState } from './questions';
import { combine, type JevAnswers, type Thresholds, type Verdict } from './score';

// Jev accepts up to 32K tokens; posts never get close, but cap pathological inputs.
const MAX_CHARS = 8000;

export function normalize(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

/** The paid part: one Jev call with the full question set. */
export function askJev(opts: {
  apiKey: string;
  model?: string;
  platform: Platform;
  text: string;
  signal?: AbortSignal;
}): Promise<JevAnswers> {
  const state: PostState = { platform: opts.platform, kind: 'post', text: normalize(opts.text) };
  return decide({
    apiKey: opts.apiKey,
    model: opts.model,
    state,
    questions: buildQuestions(),
    signal: opts.signal,
  });
}

/** The free part: local checks + scoring. Cheap to re-run, e.g. with re-fitted thresholds. */
export function scoreResponse(
  res: JevAnswers,
  text: string,
  opts: { partial?: boolean; thresholds?: Thresholds } = {},
): Verdict {
  return combine(res, runLocalChecks(normalize(text)), opts);
}

export async function classify(
  opts: Parameters<typeof askJev>[0] & { partial?: boolean; thresholds?: Thresholds },
): Promise<Verdict> {
  return scoreResponse(await askJev(opts), opts.text, opts);
}
