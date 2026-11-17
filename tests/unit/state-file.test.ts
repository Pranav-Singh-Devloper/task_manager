import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStateStore } from '../../server/services/state';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-state-'));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

describe('FileStateStore', () => {
  it('returns null when the file is missing', async () => {
    expect(await new FileStateStore(dir).read()).toBeNull();
  });

  it('writes and reads back, and survives a new instance (a restart)', async () => {
    await new FileStateStore(dir).write({
      jobs: {},
      activeSpreadsheetId: 'abc',
      refreshTokenEnc: 'v1:xyz',
    });
    const state = await new FileStateStore(dir).read();
    expect(state?.activeSpreadsheetId).toBe('abc');
    expect(state?.refreshTokenEnc).toBe('v1:xyz');
  });

  it('creates the folder on first write and leaves no temp files behind', async () => {
    const nested = path.join(dir, 'a', 'b');
    await new FileStateStore(nested).write({ jobs: {} });
    expect(await fs.readdir(nested)).toEqual(['state.json']);
  });

  it("starts again when the owner has changed, and keeps the old owner's file aside", async () => {
    await new FileStateStore(dir, 'old@example.com').write({
      jobs: {},
      ownerEmail: 'old@example.com',
      activeSpreadsheetId: 'old-sheet',
      refreshTokenEnc: 'v1:old',
    });
    // Same owner (any letter case): read as usual.
    expect((await new FileStateStore(dir, 'OLD@example.com').read())?.activeSpreadsheetId).toBe(
      'old-sheet',
    );
    // A new owner: nothing carries over, so the old token and database are never used for them.
    const store = new FileStateStore(dir, 'new@example.com');
    expect(await store.read()).toBeNull();
    expect(await store.read()).toBeNull();
    const files = await fs.readdir(dir);
    expect(files).not.toContain('state.json');
    const aside = files.find((f) => f.startsWith('state.previous-owner-'));
    expect(aside).toBeDefined();
    const kept = JSON.parse(await fs.readFile(path.join(dir, aside!), 'utf8')) as {
      activeSpreadsheetId: string;
    };
    expect(kept.activeSpreadsheetId).toBe('old-sheet');
  });

  it('keeps the file private to the owner', async () => {
    await new FileStateStore(dir).write({ jobs: {} });
    const mode = (await fs.stat(path.join(dir, 'state.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('treats a corrupt file as missing instead of crashing', async () => {
    await fs.writeFile(path.join(dir, 'state.json'), '{ not json');
    expect(await new FileStateStore(dir).read()).toBeNull();
  });

  it('treats a file that is not an object as missing', async () => {
    await fs.writeFile(path.join(dir, 'state.json'), '[1,2]');
    expect(await new FileStateStore(dir).read()).toBeNull();
  });

  it('a second write replaces the first completely', async () => {
    const store = new FileStateStore(dir);
    await store.write({ jobs: {}, activeSpreadsheetId: 'one' });
    await store.write({ jobs: {}, activeSpreadsheetId: 'two' });
    expect((await store.read())?.activeSpreadsheetId).toBe('two');
  });
});
