import { describe, expect, it } from 'vitest';
import { KeyedMutex } from '../../server/lib/mutex';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedMutex', () => {
  it('runs tasks for one key strictly one after another', async () => {
    const m = new KeyedMutex();
    const log: string[] = [];
    const task = (name: string, ms: number) =>
      m.run('tab', async () => {
        log.push(`start ${name}`);
        await sleep(ms);
        log.push(`end ${name}`);
      });
    await Promise.all([task('a', 20), task('b', 1), task('c', 1)]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('lets different keys run side by side', async () => {
    const m = new KeyedMutex();
    const log: string[] = [];
    await Promise.all([
      m.run('x', async () => {
        log.push('x1');
        await sleep(20);
        log.push('x2');
      }),
      m.run('y', async () => {
        log.push('y1');
        await sleep(1);
        log.push('y2');
      }),
    ]);
    expect(log).toEqual(['x1', 'y1', 'y2', 'x2']);
  });

  it('keeps going after a task fails, and passes the failure to its caller', async () => {
    const m = new KeyedMutex();
    const failing = m.run('k', async () => {
      throw new Error('boom');
    });
    const after = m.run('k', async () => 'still runs');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('still runs');
  });

  it('forgets a key once its work is done', async () => {
    const m = new KeyedMutex();
    await m.run('k', async () => 1);
    expect(m.busy).toBe(0);
  });

  it('returns each task its own result', async () => {
    const m = new KeyedMutex();
    expect(await Promise.all([m.run('k', async () => 1), m.run('k', async () => 2)])).toEqual([
      1, 2,
    ]);
  });
});
