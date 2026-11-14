import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { guarded } from '../../server/jobs';
import { FileService, PENDING_MAX_AGE_MS } from '../../server/services/files';
import { MeetingService, type Actor } from '../../server/services/meetings';
import { UndoService } from '../../server/services/undo';
import { fixture, logger } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  const meetings = new MeetingService(f.store, new UndoService(() => f.clock.now));
  const files = new FileService(f.store, meetings, { maxBytes: () => 1024 * 1024 });
  const upload = (meetingId: string) =>
    files.upload(
      {
        meetingId,
        category: 'ccie',
        date: '2027-01-05',
        title: 'Jobs',
        name: 'note.pdf',
        mime: 'application/pdf',
        stream: Readable.from([Buffer.from('hello')]),
      },
      dad,
    );
  return { f, files, upload };
}

describe('clearing uploads nobody saved', () => {
  it('trashes pending files older than 24 hours and leaves newer ones alone', async () => {
    const { f, files, upload } = await setup();
    const old = await upload(newId());
    f.clock.advance(PENDING_MAX_AGE_MS - 60_000);
    const fresh = await upload(newId());
    f.clock.advance(2 * 60_000);

    expect(await files.expirePending()).toBe(1);
    const driveId = (view: string) => view.split('/')[4]!;
    expect(f.mock.world.files.get(driveId(old.view_link))!.trashed).toBe(true);
    expect(f.mock.world.files.get(driveId(fresh.view_link))!.trashed).toBe(false);
    expect(await files.expirePending()).toBe(0);
  });

  it('never touches a file that was attached to a saved meeting', async () => {
    const { f, files, upload } = await setup();
    const id = newId();
    const meetings = new MeetingService(f.store, new UndoService(() => f.clock.now));
    await meetings.create(
      {
        id,
        category: 'ccie',
        values: {
          date: '2027-01-05',
          start_time: '10:00',
          case_id: 'C-1',
          project_name: 'NH',
          state: 'Kerala',
        },
      },
      dad,
    );
    const up = await upload(id);
    await files.attach(id, [up.id], dad);
    f.clock.advance(PENDING_MAX_AGE_MS * 3);
    expect(await files.expirePending()).toBe(0);
  });
});

describe('background jobs', () => {
  it('record when they ran, and pause while the sign-in is not valid', async () => {
    const { f } = await setup();
    let runs = 0;
    const job = guarded('demo-job', f.mock.services, logger, async () => {
      runs += 1;
      return 'Did a thing';
    });
    await job();
    expect(runs).toBe(1);
    expect((await f.mock.services.state.read())?.jobs['demo-job']).toMatchObject({
      ok: true,
      message: 'Did a thing',
    });

    const state = (await f.mock.services.state.read())!;
    await f.mock.services.state.write({ ...state, tokenInvalid: true });
    await job();
    expect(runs).toBe(1);

    await f.mock.services.state.write({ ...state, tokenInvalid: false });
    await job();
    expect(runs).toBe(2);
  });

  it('say so when they fail, and never throw', async () => {
    const { f } = await setup();
    const job = guarded('broken-job', f.mock.services, logger, async () => {
      throw new Error('boom');
    });
    await expect(job()).resolves.toBeUndefined();
    expect((await f.mock.services.state.read())?.jobs['broken-job']?.ok).toBe(false);
  });
});
