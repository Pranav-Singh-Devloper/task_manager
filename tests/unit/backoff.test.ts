import { describe, expect, it } from 'vitest';
import { withBackoff } from '../../server/lib/backoff';

const retryable = (e: unknown) => (e as { retry?: boolean }).retry === true;

describe('withBackoff', () => {
  it('returns the first success without waiting', async () => {
    const sleeps: number[] = [];
    expect(
      await withBackoff(async () => 'ok', retryable, { sleep: async (ms) => void sleeps.push(ms) }),
    ).toBe('ok');
    expect(sleeps).toEqual([]);
  });

  it('retries a retryable failure and then succeeds', async () => {
    let n = 0;
    const result = await withBackoff(
      async () => {
        n += 1;
        if (n < 3) throw { retry: true };
        return 'done';
      },
      retryable,
      { sleep: async () => undefined },
    );
    expect(result).toBe('done');
    expect(n).toBe(3);
  });

  it('does not retry an error that is not retryable', async () => {
    let n = 0;
    await expect(
      withBackoff(
        async () => {
          n += 1;
          throw { retry: false };
        },
        retryable,
        { sleep: async () => undefined },
      ),
    ).rejects.toEqual({ retry: false });
    expect(n).toBe(1);
  });

  it('gives up after the retry limit and throws the last error', async () => {
    let n = 0;
    await expect(
      withBackoff(
        async () => {
          n += 1;
          throw { retry: true, n };
        },
        retryable,
        { retries: 2, sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ n: 3 });
    expect(n).toBe(3);
  });

  it('waits longer each time, with jitter, up to a cap', async () => {
    const sleeps: number[] = [];
    await expect(
      withBackoff(
        async () => {
          throw { retry: true };
        },
        retryable,
        {
          retries: 5,
          baseMs: 100,
          maxMs: 500,
          random: () => 1,
          sleep: async (ms) => void sleeps.push(ms),
        },
      ),
    ).rejects.toBeDefined();
    expect(sleeps).toEqual([100, 200, 400, 500, 500]);
  });

  it('jitter never waits less than half the delay', async () => {
    const sleeps: number[] = [];
    await expect(
      withBackoff(
        async () => {
          throw { retry: true };
        },
        retryable,
        {
          retries: 1,
          baseMs: 100,
          random: () => 0,
          sleep: async (ms) => void sleeps.push(ms),
        },
      ),
    ).rejects.toBeDefined();
    expect(sleeps).toEqual([50]);
  });
});
