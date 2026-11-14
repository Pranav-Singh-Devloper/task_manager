import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { calendarEventIdFor, newId } from '../../shared/ids';
import { TAB } from '../../shared/schema';
import type { CalendarEventInput } from '../../server/services/google/types';
import { createMockGoogle } from '../../server/services/google/mock';

const event = (id: string, minutes = [1440, 60]): CalendarEventInput => ({
  id,
  summary: '[CCIE] Test',
  description: '',
  start: { dateTime: '2026-11-17T10:30:00', timeZone: 'Asia/Kolkata' },
  end: { dateTime: '2026-11-17T11:30:00', timeZone: 'Asia/Kolkata' },
  reminders: {
    useDefault: false,
    overrides: minutes.map((m) => ({ method: 'popup' as const, minutes: m })),
  },
  extendedProperties: { private: {} },
});

describe('mock Calendar', () => {
  it('returns 409 for a reused id, even after delete, and update restores it', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const id = calendarEventIdFor(newId());
    await services.calendar.insertEvent('primary', event(id));
    await expect(services.calendar.insertEvent('primary', event(id))).rejects.toMatchObject({
      status: 409,
    });

    await services.calendar.deleteEvent('primary', id);
    await expect(services.calendar.insertEvent('primary', event(id))).rejects.toMatchObject({
      status: 409,
    });
    expect((await services.calendar.getEvent('primary', id)).status).toBe('cancelled');

    const restored = await services.calendar.updateEvent('primary', id, {
      ...event(id),
      status: 'confirmed',
    });
    expect(restored.status).toBe('confirmed');
  });

  it('enforces the reminder limits and id format', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const id = calendarEventIdFor(newId());
    await expect(
      services.calendar.insertEvent('primary', event(id, [1, 2, 3, 4, 5, 6])),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      services.calendar.insertEvent('primary', event(id, [40321])),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      services.calendar.insertEvent('primary', event('NOT VALID!')),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('mock Sheets and Drive', () => {
  it('seeds a discoverable database with every tab and demo meetings', async () => {
    const { services, database } = await createMockGoogle({ seed: 'demo' });
    const found = await services.drive.findByAppProperties({
      app: 'meetings-manager',
      role: 'database',
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(database?.spreadsheetId);

    const tabs = await services.sheets.getTabs(found[0]!.id);
    const titles = tabs.map((t) => t.title);
    for (const t of [
      'CCIE',
      'SFC_PPPAC',
      'AT',
      'Court Case',
      'Others',
      TAB.tasks,
      TAB.categories,
      TAB.fields,
      TAB.system,
    ]) {
      expect(titles).toContain(t);
    }

    const ccie = tabs.find((t) => t.title === 'CCIE')!;
    const data = (await services.sheets.batchGet(found[0]!.id, [ccie.gid]))[ccie.gid]!;
    expect(data[0]).toContain('case_id');
    expect(data.length).toBeGreaterThan(3);
  });

  it('puts upcoming demo meetings on the mock calendar', async () => {
    const { world } = await createMockGoogle({ seed: 'demo' });
    expect(world.calendars.get('primary')?.size).toBeGreaterThan(5);
  });

  it('creates a clean account with nothing in Drive', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    expect(
      await services.drive.findByAppProperties({ app: 'meetings-manager', role: 'database' }),
    ).toHaveLength(0);
  });

  it('references tabs by gid, so renaming a tab breaks nothing', async () => {
    const { services, database } = await createMockGoogle({ seed: 'demo' });
    const gid = database!.config.categories.find((c) => c.slug === 'ccie')!.sheet_gid!;
    await services.sheets.renameTab(database!.spreadsheetId, gid, 'Conciliation');
    const data = await services.sheets.batchGet(database!.spreadsheetId, [gid]);
    expect(data[gid]?.[0]).toContain('case_id');
  });

  it('uploads a stream and returns a view link', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const folder = await services.drive.ensureFolder('Meetings Manager');
    const file = await services.drive.uploadFile({
      name: 'note.pdf',
      mimeType: 'application/pdf',
      parentId: folder.id,
      stream: Readable.from([Buffer.from('hello pdf')]),
    });
    expect(file.size).toBe(9);
    expect(file.webViewLink).toContain(file.id);
    expect((await services.drive.ensureFolder('Meetings Manager')).id).toBe(folder.id);
  });

  it('injected drive failures surface as 503 and leave Sheets alone', async () => {
    const { services } = await createMockGoogle({ seed: 'empty', failures: 'drive' });
    await expect(services.drive.ensureFolder('x')).rejects.toMatchObject({ status: 503 });
    const file = await services.drive.createSpreadsheetFile('db', {});
    await expect(services.sheets.getTabs(file.id)).resolves.toHaveLength(1);
  });

  it('backup copies carry the role we set, never database', async () => {
    const { services, database } = await createMockGoogle({ seed: 'demo' });
    const folder = await services.drive.ensureFolder('Backups');
    const copy = await services.drive.copyFile(
      database!.spreadsheetId,
      'backup-2026-11-14',
      folder.id,
      {
        app: 'meetings-manager',
        role: 'backup',
      },
    );
    const dbs = await services.drive.findByAppProperties({
      app: 'meetings-manager',
      role: 'database',
    });
    expect(dbs.map((f) => f.id)).toEqual([database!.spreadsheetId]);
    expect(copy.appProperties.role).toBe('backup');
  });
});
