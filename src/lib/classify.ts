import { decide, type DecisionsResponse } from './jev';
import { runAiHeuristics, runHeuristics } from './heuristics';
import { buildQuestions, type PostState, type SlopQuestionKey } from './questions';
import { combine, type Verdict } from './score';

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

export type SlopResponse = DecisionsResponse<SlopQuestionKey>;

/** The paid part: one Jev call with the full question set. */
export function askJev(opts: {
  apiKey: string;
  model?: string;
  platform: PostState['platform'];
  text: string;
  signal?: AbortSignal;
}): Promise<SlopResponse> {
  const state: PostState = { platform: opts.platform, kind: 'post', text: normalize(opts.text) };
  return decide({
    apiKey: opts.apiKey,
    model: opts.model,
    state,
    questions: buildQuestions(),
    signal: opts.signal,
  });
}

/** The free part: local heuristics + scoring. Cheap to re-run, e.g. after threshold changes. */
export function scoreResponse(res: SlopResponse, text: string, partial = false): Verdict {
  const clean = normalize(text);
  return combine(res, runHeuristics(clean).hits, partial, runAiHeuristics(clean));
}

export async function classify(opts: Parameters<typeof askJev>[0] & { partial?: boolean }): Promise<Verdict> {
  return scoreResponse(await askJev(opts), opts.text, opts.partial);
}
