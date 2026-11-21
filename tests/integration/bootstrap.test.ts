import { describe, expect, it } from 'vitest';
import { TAB } from '../../shared/schema';
import { bootstrap, runMigrations, type Migration } from '../../server/services/bootstrap';
import { createMockGoogle } from '../../server/services/google/mock';

const DB = { app: 'meetings-manager', role: 'database' };

describe('bootstrap', () => {
  it('on a clean account creates the database, all tabs, seeded categories and Drive folders', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const result = await bootstrap(services);
    expect(result.created).toBe(true);

    const tabs = (await services.sheets.getTabs(result.spreadsheetId)).map((t) => t.title);
    for (const t of [
      'CCIE',
      'SFC_PPPAC',
      'MORTH',
      'PMG',
      'PATSC_IAC',
      'File Discussion',
      'AT',
      'Court Case',
      'Others',
      TAB.tasks,
      TAB.categories,
      TAB.fields,
      TAB.workspaces,
      TAB.settings,
      TAB.files,
      TAB.reschedules,
      TAB.audit,
      TAB.lookups,
      TAB.system,
    ]) {
      expect(tabs).toContain(t);
    }

    const cats = tabs.indexOf('_categories');
    expect(cats).toBeGreaterThan(-1);
    const info = (await services.sheets.getTabs(result.spreadsheetId)).find(
      (t) => t.title === TAB.categories,
    )!;
    const rows = (await services.sheets.batchGet(result.spreadsheetId, [info.gid]))[info.gid]!;
    expect(rows.slice(1).map((r) => r[0])).toContain('ccie');
    expect(rows.length - 1).toBe(11);

    const state = await services.state.read();
    expect(state?.activeSpreadsheetId).toBe(result.spreadsheetId);
    expect(state?.driveRootFolderId).toBe(result.driveRootFolderId);
    expect(state?.driveBackupsFolderId).toBe(result.driveBackupsFolderId);
  });

  it('a second run reuses the same database and creates nothing new', async () => {
    const { services, world } = await createMockGoogle({ seed: 'empty' });
    const first = await bootstrap(services);
    const filesBefore = world.files.size;
    const second = await bootstrap(services);
    expect(second.created).toBe(false);
    expect(second.spreadsheetId).toBe(first.spreadsheetId);
    expect(world.files.size).toBe(filesBefore);
    expect(await services.drive.findByAppProperties(DB)).toHaveLength(1);
  });

  it('after the state file is lost, finds the database again through Drive', async () => {
    const { services, state } = await createMockGoogle({ seed: 'empty' });
    const first = await bootstrap(services);
    state.lose();
    expect(await services.state.read()).toBeNull();

    const again = await bootstrap(services);
    expect(again.created).toBe(false);
    expect(again.spreadsheetId).toBe(first.spreadsheetId);
    expect((await services.state.read())?.activeSpreadsheetId).toBe(first.spreadsheetId);
  });

  it('finds the pre-existing demo database instead of making another', async () => {
    const { services, database } = await createMockGoogle({ seed: 'demo' });
    const result = await bootstrap(services);
    expect(result.created).toBe(false);
    expect(result.spreadsheetId).toBe(database!.spreadsheetId);
  });

  it('with several databases, uses the most recently changed and reports the extras', async () => {
    const { services, world } = await createMockGoogle({ seed: 'empty' });
    const older = await services.drive.createSpreadsheetFile('old', DB);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await services.drive.createSpreadsheetFile('new', DB);
    world.files.get(older.id)!.modifiedTime = '2020-01-01T00:00:00.000Z';

    const result = await bootstrap(services);
    expect(result.spreadsheetId).toBe(newer.id);
    expect(result.duplicateDatabases).toBe(1);
    expect((await services.state.read())?.duplicateDatabases).toBe(1);
  });

  it('never picks a backup as the database', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const first = await bootstrap(services);
    const backups = (await services.state.read())!.driveBackupsFolderId!;
    await services.drive.copyFile(first.spreadsheetId, 'backup', backups, {
      app: 'meetings-manager',
      role: 'backup',
    });
    await services.state.write({ jobs: {} });
    expect((await bootstrap(services)).spreadsheetId).toBe(first.spreadsheetId);
  });

  it('honours the SPREADSHEET_ID override', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const other = await services.drive.createSpreadsheetFile('mine', {});
    const result = await bootstrap(services, { spreadsheetId: other.id });
    expect(result.spreadsheetId).toBe(other.id);
    expect(result.created).toBe(false);
  });

  it('explains a SPREADSHEET_ID that cannot be opened', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    await expect(bootstrap(services, { spreadsheetId: 'does-not-exist' })).rejects.toThrow(
      /SPREADSHEET_ID/,
    );
  });

  it('replaces a saved id whose spreadsheet was deleted', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    await services.state.write({ jobs: {}, activeSpreadsheetId: 'gone' });
    const result = await bootstrap(services);
    expect(result.spreadsheetId).not.toBe('gone');
    expect(result.created).toBe(true);
  });

  it('keeps the owner token in the state file when it saves ids', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    await services.state.write({ jobs: {}, refreshTokenEnc: 'v1:keep-me' });
    await bootstrap(services);
    expect((await services.state.read())?.refreshTokenEnc).toBe('v1:keep-me');
  });

  it('a Drive failure surfaces instead of half-finishing silently', async () => {
    const { services } = await createMockGoogle({ seed: 'empty', failures: 'drive' });
    await expect(bootstrap(services)).rejects.toMatchObject({ status: 503 });
  });
});

describe('migrations', () => {
  const noop = (calls: number[], version: number): Migration => ({
    version,
    run: async () => {
      calls.push(version);
    },
  });

  it('applies newer migrations once, in order, and records the version', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const { spreadsheetId } = await bootstrap(services);
    const calls: number[] = [];
    // Bootstrap has already applied the app's own migrations, so these test versions come after them.
    const migrations = [noop(calls, 11), noop(calls, 10)];

    expect(await runMigrations(services, spreadsheetId, migrations)).toBe(11);
    expect(calls).toEqual([10, 11]);
    expect(await runMigrations(services, spreadsheetId, migrations)).toBe(11);
    expect(calls).toEqual([10, 11]);
  });

  it('restores a _system tab that was deleted by hand', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const { spreadsheetId } = await bootstrap(services);
    const sys = (await services.sheets.getTabs(spreadsheetId)).find((t) => t.title === TAB.system)!;
    await services.sheets.renameTab(spreadsheetId, sys.gid, 'renamed-away');
    await runMigrations(services, spreadsheetId, []);
    expect((await services.sheets.getTabs(spreadsheetId)).map((t) => t.title)).toContain(
      TAB.system,
    );
  });
});
