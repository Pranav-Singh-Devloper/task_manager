import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { buildEventPayload } from '../../server/services/calendarEvent';
import { upsertEvent } from '../../server/services/calendarSync';
import { createMockGoogle } from '../../server/services/google/mock';

const payload = (id: string) =>
  buildEventPayload({
    meetingId: id,
    categorySlug: 'others',
    categoryName: 'Others',
    title: 'Review',
    date: '2026-11-17',
    startTime: '10:30',
    endTime: '11:30',
    timezone: 'Asia/Kolkata',
    appUrl: 'http://x',
    reminderMinutes: [60],
  });

describe('upsertEvent', () => {
  it('creates the event once', async () => {
    const { services, world } = await createMockGoogle({ seed: 'empty' });
    await upsertEvent(services.calendar, 'primary', payload(newId()));
    expect(world.calendars.get('primary')?.size).toBe(1);
  });

  it('a retried save after a lost answer never makes a second event', async () => {
    const { services, world } = await createMockGoogle({ seed: 'empty' });
    const p = payload(newId());
    await upsertEvent(services.calendar, 'primary', p);
    await upsertEvent(services.calendar, 'primary', p);
    expect(world.calendars.get('primary')?.size).toBe(1);
  });

  it('restoring a cancelled meeting brings the same event back, confirmed', async () => {
    const { services, world } = await createMockGoogle({ seed: 'empty' });
    const p = payload(newId());
    await upsertEvent(services.calendar, 'primary', p);
    await services.calendar.deleteEvent('primary', p.id);
    expect(world.calendars.get('primary')?.get(p.id)?.status).toBe('cancelled');

    const restored = await upsertEvent(services.calendar, 'primary', p);
    expect(restored.status).toBe('confirmed');
    expect(world.calendars.get('primary')?.size).toBe(1);
  });

  it('a rescheduled payload updates the existing event', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const id = newId();
    await upsertEvent(services.calendar, 'primary', payload(id));
    const moved = {
      ...payload(id),
      start: { dateTime: '2026-11-18T10:30:00', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-11-18T11:30:00', timeZone: 'Asia/Kolkata' },
    };
    await upsertEvent(services.calendar, 'primary', moved);
    expect((await services.calendar.getEvent('primary', moved.id)).start.dateTime).toBe(
      '2026-11-18T10:30:00',
    );
  });

  it('other failures are not hidden', async () => {
    const { services } = await createMockGoogle({ seed: 'empty', failures: 'calendar' });
    await expect(upsertEvent(services.calendar, 'primary', payload(newId()))).rejects.toMatchObject(
      { status: 503 },
    );
  });
});
