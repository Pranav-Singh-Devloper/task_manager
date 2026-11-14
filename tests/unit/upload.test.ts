import { describe, expect, it } from 'vitest';
import { driveFileName, isAllowedMime, safeFileName } from '../../server/lib/upload';

describe('isAllowedMime', () => {
  it('allows the types in the spec', () => {
    for (const m of [
      'application/pdf',
      'image/png',
      'text/csv',
      'application/zip',
      'text/plain; charset=utf-8',
    ]) {
      expect(isAllowedMime(m)).toBe(true);
    }
  });
  it('refuses programs and web pages', () => {
    for (const m of [
      'application/x-msdownload',
      'text/html',
      'application/javascript',
      'image/svg+xml',
      '',
    ]) {
      expect(isAllowedMime(m)).toBe(false);
    }
  });
});

describe('safeFileName', () => {
  it('drops folders so a name can never escape its place', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\dad\\note.pdf')).toBe('note.pdf');
  });
  it('removes control characters and characters Drive dislikes', () => {
    expect(safeFileName('a\u0000b<c>:d|e?.pdf')).toBe('abcde.pdf');
  });
  it('keeps normal and non-English names readable', () => {
    expect(safeFileName('Land note (final) v2.pdf')).toBe('Land note (final) v2.pdf');
    expect(safeFileName('बैठक नोट.pdf')).toBe('बैठक नोट.pdf');
  });
  it('never returns an empty or hidden name, and limits the length', () => {
    expect(safeFileName('')).toBe('file');
    expect(safeFileName('...')).toBe('file');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('x'.repeat(500)).length).toBe(150);
  });
});

describe('driveFileName', () => {
  it('follows the pattern from the spec', () => {
    expect(driveFileName('2026-11-17', 'CCIE — NH-44', 'note.pdf')).toBe(
      '2026-11-17 — CCIE — NH-44 — note.pdf',
    );
  });
});
