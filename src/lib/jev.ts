// Minimal typed client for OpenRouter's Decisions API (Jev).
// Runtime-agnostic (plain fetch) so the extension and the eval script share it.

export const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const DEFAULT_MODEL = 'typesafe/jev-1.13';

export type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria: { true: string; false: string };
};
export type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};
export type ScoreQuestion = {
  type: 'score';
  instructions: string;
  criteria: string[];
};
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type NoulAnswer = { type: 'noul'; noul: number };
export type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type ScoreAnswer = {
  type: 'score';
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
};
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type DecisionsResponse<K extends string> = {
  id?: string;
  model: string;
  provider?: string;
  answers: Record<K, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
};

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** Worth retrying: rate limits, provider hiccups, timeouts. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export async function decide<K extends string>(opts: {
  apiKey: string;
  model?: string;
  state: unknown;
  questions: Record<K, Question>;
  signal?: AbortSignal;
}): Promise<DecisionsResponse<K>> {
  const res = await fetch(DECISIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Slop Detector',
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      state: opts.state,
      questions: opts.questions,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new JevError(message, res.status);
  }
  return (await res.json()) as DecisionsResponse<K>;
}
