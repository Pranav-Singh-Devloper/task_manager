import { describe, expect, it } from 'vitest';
import { GoogleApiError } from '../../server/services/google/errors';
import { run, toGoogleError, type LiveContext } from '../../server/services/google/live/call';
import { appPropertiesQuery, q } from '../../server/services/google/live/drive';
import {
  columnRuns,
  firstRowOf,
  formatRequests,
  quoteTab,
} from '../../server/services/google/live/sheets';

describe('toGoogleError', () => {
  it('keeps the HTTP status, so a reused calendar id is a 409', () => {
    const err = toGoogleError({
      message: 'The requested identifier already exists.',
      response: { status: 409, data: {} },
    });
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.status).toBe(409);
  });

  it('reads the reason from Google error bodies', () => {
    const err = toGoogleError({
      message: 'Rate Limit Exceeded',
      response: { status: 429, data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } },
    });
    expect(err.status).toBe(429);
    expect(err.reason).toBe('rateLimitExceeded');
    expect(err.retryable).toBe(true);
  });

  it('turns a dead refresh token into a 401 invalid_grant', () => {
    const err = toGoogleError({
      message: 'invalid_grant',
      response: { status: 400, data: { error: 'invalid_grant' } },
    });
    expect(err.status).toBe(401);
    expect(err.reason).toBe('invalid_grant');
    expect(err.retryable).toBe(false);
  });

  it('treats connection failures as network errors', () => {
    expect(toGoogleError({ code: 'ECONNRESET', message: 'socket hang up' }).reason).toBe('network');
    expect(toGoogleError({ message: 'fetch failed' }).status).toBe(0);
  });

  it('passes an existing GoogleApiError through', () => {
    const original = new GoogleApiError(404, 'gone', 'notFound');
    expect(toGoogleError(original)).toBe(original);
  });

  it('5xx is retryable, 4xx is not', () => {
    expect(toGoogleError({ message: 'x', response: { status: 503 } }).retryable).toBe(true);
    expect(toGoogleError({ message: 'x', response: { status: 403 } }).retryable).toBe(false);
  });
});

describe('run()', () => {
  const ctx = (calls: string[]): LiveContext => ({
    authClient: async () => {
      throw new Error('unused');
    },
    onInvalidGrant: async () => void calls.push('invalid'),
  });

  it('reports a dead token once and throws a normalised error', async () => {
    const calls: string[] = [];
    await expect(
      run(ctx(calls), async () => {
        throw {
          message: 'invalid_grant',
          response: { status: 400, data: { error: 'invalid_grant' } },
        };
      }),
    ).rejects.toMatchObject({ status: 401, reason: 'invalid_grant' });
    expect(calls).toEqual(['invalid']);
  });

  it('does not report a dead token for an ordinary failure', async () => {
    const calls: string[] = [];
    await expect(
      run(ctx(calls), async () => {
        throw { message: 'nope', response: { status: 404 } };
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual([]);
  });

  it('returns the value on success', async () => {
    expect(await run(ctx([]), async () => 42)).toBe(42);
  });
});

describe('Sheets helpers', () => {
  it('quotes tab names for A1 notation, doubling apostrophes', () => {
    expect(quoteTab('File Discussion')).toBe("'File Discussion'");
    expect(quoteTab("Dad's tab")).toBe("'Dad''s tab'");
  });

  it('finds the first appended row from the updated range', () => {
    expect(firstRowOf("'CCIE'!A5:AB5")).toBe(5);
    expect(firstRowOf("'Court Case'!A120:Z121")).toBe(120);
    expect(firstRowOf(undefined)).toBe(1);
  });

  it('groups hidden columns into contiguous runs', () => {
    expect(columnRuns([20, 21, 22, 5, 6, 22])).toEqual([
      [5, 7],
      [20, 23],
    ]);
  });

  it('builds the formatting requests for a category tab', () => {
    const reqs = formatRequests(7, {
      frozenRows: 1,
      protectHeader: true,
      hiddenColumns: [10, 11, 12],
      headerNotes: { 4: 'Calculated in the app' },
    });
    const kinds = reqs.map((r) => Object.keys(r)[0]);
    expect(kinds).toEqual([
      'updateSheetProperties',
      'updateDimensionProperties',
      'updateCells',
      'addProtectedRange',
    ]);
    expect(reqs[0]?.updateSheetProperties?.properties?.gridProperties?.frozenRowCount).toBe(1);
    expect(reqs[1]?.updateDimensionProperties?.range).toMatchObject({
      sheetId: 7,
      startIndex: 10,
      endIndex: 13,
    });
    expect(reqs[2]?.updateCells?.rows?.[0]?.values?.[0]?.note).toBe('Calculated in the app');
    expect(reqs[3]?.addProtectedRange?.protectedRange?.warningOnly).toBe(true);
  });

  it('hides a tab last and asks for nothing when there is nothing to do', () => {
    expect(formatRequests(1, {})).toEqual([]);
    const reqs = formatRequests(1, { frozenRows: 1, hidden: true });
    expect(reqs[reqs.length - 1]?.updateSheetProperties?.fields).toBe('hidden');
  });
});

describe('Drive query', () => {
  it('escapes quotes so a name can never break the query', () => {
    expect(q("it's")).toBe("'it\\'s'");
  });

  it('finds the database by appProperties and ignores trashed files', () => {
    expect(appPropertiesQuery({ app: 'meetings-manager', role: 'database' })).toBe(
      "appProperties has { key='app' and value='meetings-manager' } and appProperties has { key='role' and value='database' } and trashed = false",
    );
  });
});
