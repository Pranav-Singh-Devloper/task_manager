import { GoogleApiError } from '../errors';

export type FailureKind = 'calendar' | 'drive' | 'sheets429' | 'network';
export type FailureArea = 'sheets' | 'drive' | 'calendar' | 'mail' | 'network-only';

const KINDS: FailureKind[] = ['calendar', 'drive', 'sheets429', 'network'];

/**
 * Makes the mock adapters fail on purpose so every error path can be tested and demoed.
 * `MOCK_FAIL=calendar,drive` fails always. `MOCK_FAIL=sheets429:2` fails the first 2 calls, then recovers.
 */
export class FailureInjector {
  private remaining = new Map<FailureKind, number>();

  constructor(spec = '') {
    this.load(spec);
  }

  /** Arms failures from a MOCK_FAIL style string. */
  load(spec: string): void {
    for (const token of spec
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)) {
      const [name, count] = token.split(':');
      if (!KINDS.includes(name as FailureKind)) {
        throw new Error(`Unknown MOCK_FAIL value "${name}". Use: ${KINDS.join(', ')}`);
      }
      this.set(name as FailureKind, count ? Number(count) : Infinity);
    }
  }

  set(kind: FailureKind, times = Infinity): void {
    this.remaining.set(kind, times);
  }

  clear(kind?: FailureKind): void {
    if (kind) this.remaining.delete(kind);
    else this.remaining.clear();
  }

  active(): FailureKind[] {
    return [...this.remaining.keys()];
  }

  /** Call at the start of every mock adapter method. Throws when a failure is armed for this area. */
  check(area: FailureArea): void {
    if (this.consume('network')) {
      throw new GoogleApiError(0, 'Network is unreachable', 'network');
    }
    if (area === 'calendar' && this.consume('calendar')) {
      throw new GoogleApiError(503, 'Calendar is unavailable', 'backendError');
    }
    if (area === 'drive' && this.consume('drive')) {
      throw new GoogleApiError(503, 'Drive is unavailable', 'backendError');
    }
    if (area === 'sheets' && this.consume('sheets429')) {
      throw new GoogleApiError(429, 'Quota exceeded for Sheets', 'rateLimitExceeded');
    }
  }

  private consume(kind: FailureKind): boolean {
    const left = this.remaining.get(kind);
    if (left === undefined) return false;
    if (left <= 1) this.remaining.delete(kind);
    else this.remaining.set(kind, left - 1);
    return true;
  }
}
