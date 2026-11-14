import { describe, expect, it } from 'vitest';
import { FailureInjector } from '../../server/services/google/mock/failure';

describe('FailureInjector', () => {
  it('fails only the armed area', () => {
    const f = new FailureInjector('calendar');
    expect(() => f.check('calendar')).toThrow(/Calendar/);
    expect(() => f.check('drive')).not.toThrow();
    expect(() => f.check('sheets')).not.toThrow();
  });

  it('sheets429 throws a retryable 429', () => {
    const f = new FailureInjector('sheets429');
    try {
      f.check('sheets');
      expect.unreachable();
    } catch (e) {
      expect((e as { status: number }).status).toBe(429);
      expect((e as { retryable: boolean }).retryable).toBe(true);
    }
  });

  it('network fails every area', () => {
    const f = new FailureInjector('network');
    for (const area of ['sheets', 'drive', 'calendar', 'mail'] as const) {
      expect(() => f.check(area)).toThrow(/Network/);
    }
  });

  it('recovers after a counted number of failures', () => {
    const f = new FailureInjector('sheets429:2');
    expect(() => f.check('sheets')).toThrow();
    expect(() => f.check('sheets')).toThrow();
    expect(() => f.check('sheets')).not.toThrow();
  });

  it('rejects unknown values so typos are noticed', () => {
    expect(() => new FailureInjector('calender')).toThrow(/Unknown MOCK_FAIL/);
  });

  it('can be cleared at runtime', () => {
    const f = new FailureInjector('drive');
    f.clear();
    expect(() => f.check('drive')).not.toThrow();
  });
});
