// Concurrency-limited task queue with retry/backoff and in-flight de-duplication.

import { JevError } from './jev';

export class TaskQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private concurrency = 4,
    private maxRetries = 3,
  ) {}

  /** Runs `fn` under the concurrency limit. Concurrent calls with the same key share one run. */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = this.withSlot(() => this.withRetry(fn)).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const retryable = err instanceof JevError ? err.retryable : err instanceof TypeError;
        if (!retryable || attempt >= this.maxRetries) throw err;
        const delay = 500 * 2 ** attempt + Math.random() * 250;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
