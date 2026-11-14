export interface BackoffOptions {
  /** Retries after the first attempt. */
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries with exponential backoff and jitter. Used for Google 429 and 5xx responses so a busy minute
 * slows the app down instead of failing a save.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  {
    retries = 5,
    baseMs = 500,
    maxMs = 20_000,
    sleep = wait,
    random = Math.random,
  }: BackoffOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const cap = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(cap / 2 + (random() * cap) / 2);
    }
  }
}
