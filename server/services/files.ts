import type { Readable } from 'node:stream';
import { newId } from '../../shared/ids';
import type { FileRecord, MeetingFile } from '../../shared/meeting';
import { FILE_HEADERS, TAB, rowFromObject } from '../../shared/schema';
import { AppError, NotFoundError, NotSetUpError, ValidationFailed } from '../lib/errors';
import { driveFileName, isAllowedMime, safeFileName } from '../lib/upload';
import type { Actor, MeetingService } from './meetings';
import type { SheetStore } from './store';

/** A pending file that was never saved with a meeting is thrown away after this long (§5.7). */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class FileTooBigError extends AppError {
  constructor(maxMb: number) {
    super(413, 'file_too_big', `That file is too big. Files can be up to ${maxMb} MB.`);
  }
}

export interface UploadRequest {
  meetingId: string;
  category: string;
  /** The meeting's date and title, for the file name. Taken from the saved meeting when there is one. */
  date?: string;
  title?: string;
  name: string;
  mime: string;
  stream: Readable;
  /** Attach straight away (the meeting is already saved and the person is on its page). */
  attach?: boolean;
}

export const toMeetingFile = (f: FileRecord): MeetingFile => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  size: f.size,
  view_link: f.view_link,
});

/**
 * Files for meetings (§5.7). `_files` is the source of truth. A file starts pending, becomes attached when the
 * meeting is saved, and is trashed in Drive (recoverable for 30 days) when removed. The meeting's `files` cell
 * mirrors the view links so the raw Sheet is useful on its own.
 */
export class FileService {
  constructor(
    private readonly store: SheetStore,
    private readonly meetings: MeetingService,
    private readonly options: { maxBytes: () => number },
  ) {}

  /** The biggest file that may be added, in bytes. */
  maxBytes(): number {
    return this.options.maxBytes();
  }

  private async filesTab(): Promise<number> {
    const snap = await this.store.snapshot();
    const tab = snap.tabs.find((t) => t.title === TAB.files);
    if (!tab) throw new NotSetUpError();
    return tab.gid;
  }

  private key = async () => this.store.tabKey(await this.filesTab());

  /** The year folder: Meetings Manager / <Category> / <YYYY>. */
  private async folderFor(categoryName: string, date: string): Promise<string> {
    const { drive, state } = this.store.google;
    const root = (await state.read())?.driveRootFolderId;
    if (!root) throw new NotSetUpError();
    const year = /^\d{4}/.test(date) ? date.slice(0, 4) : String(this.store.now().getFullYear());
    const category = await drive.ensureFolder(safeFileName(categoryName), root);
    return (await drive.ensureFolder(year, category.id)).id;
  }

  async upload(
    req: UploadRequest,
    actor: Actor,
  ): Promise<MeetingFile & { status: string; meeting_id: string }> {
    if (!isAllowedMime(req.mime)) {
      throw new ValidationFailed([
        {
          field: 'file',
          message:
            'That kind of file cannot be added. Please use a PDF, Word, Excel, PowerPoint, picture, text, CSV or zip file.',
        },
      ]);
    }
    const snap = await this.store.snapshot();
    const cfg = snap.config.byCategory.get(req.category);
    if (!cfg) throw new NotFoundError("We couldn't find that category.");

    // A saved meeting decides its own date and title for the file name.
    let date = req.date ?? '';
    let title = req.title ?? '';
    let saved = false;
    try {
      const m = await this.meetings.get(req.meetingId);
      saved = true;
      if (typeof m.values.date === 'string') date = m.values.date;
      title = m.title;
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = this.store.now().toISOString().slice(0, 10);
    if (!title) title = cfg.category.name;

    const original = safeFileName(req.name);
    const parentId = await this.folderFor(cfg.category.name, date);
    const uploaded = await this.store.google.drive.uploadFile({
      name: driveFileName(date, title, original),
      mimeType: req.mime.split(';')[0]?.trim() ?? req.mime,
      parentId,
      stream: req.stream,
      appProperties: { app: 'meetings-manager', mmMeetingId: req.meetingId },
    });
    const record: FileRecord = {
      id: newId(),
      meeting_id: req.meetingId,
      category_slug: req.category,
      name: original,
      mime: req.mime.split(';')[0]?.trim() ?? req.mime,
      size: uploaded.size ?? 0,
      drive_file_id: uploaded.id,
      view_link: uploaded.webViewLink,
      status: req.attach && saved ? 'attached' : 'pending',
      uploaded_at: this.store.now().toISOString(),
    };
    try {
      const gid = await this.filesTab();
      await this.store.google.sheets.appendRows(this.store.spreadsheetId, gid, [
        rowFromObject(FILE_HEADERS, { ...record }),
      ]);
    } catch (err) {
      // No record means no way to find the file again: do not leave it behind in Drive.
      await this.store.google.drive.trashFile(uploaded.id).catch(() => undefined);
      throw err;
    }
    await this.store.reloadFiles();
    if (record.status === 'attached') await this.mirror(req.meetingId, actor);
    return { ...toMeetingFile(record), status: record.status, meeting_id: record.meeting_id };
  }

  /** Pending files for this meeting become attached. Safe to repeat. Ignores ids that belong elsewhere. */
  async attach(meetingId: string, fileIds: string[], actor: Actor): Promise<void> {
    if (fileIds.length === 0) return;
    const gid = await this.filesTab();
    await this.store.mutex.run(await this.key(), async () => {
      const rows = (await this.store.google.sheets.batchGet(this.store.spreadsheetId, [gid]))[gid];
      const header = rows?.[0] ?? [];
      const col = (k: string) => header.indexOf(k);
      for (let i = 1; i < (rows?.length ?? 0); i += 1) {
        const r = rows![i]!;
        if (!fileIds.includes(String(r[col('id')])) || r[col('meeting_id')] !== meetingId) continue;
        if (r[col('status')] !== 'pending') continue;
        const next = [...r];
        next[col('status')] = 'attached';
        await this.store.google.sheets.updateRow(this.store.spreadsheetId, gid, i + 1, next);
      }
    });
    await this.store.reloadFiles();
    await this.mirror(meetingId, actor);
  }

  /** Detaches a file: the Sheet row says removed and the Drive file goes to the trash (recoverable for 30 days). */
  async remove(fileId: string, actor: Actor): Promise<{ meetingId: string }> {
    const gid = await this.filesTab();
    const found = await this.store.mutex.run(await this.key(), async () => {
      const rows = (await this.store.google.sheets.batchGet(this.store.spreadsheetId, [gid]))[gid];
      const header = rows?.[0] ?? [];
      const col = (k: string) => header.indexOf(k);
      for (let i = 1; i < (rows?.length ?? 0); i += 1) {
        const r = rows![i]!;
        if (r[col('id')] !== fileId || r[col('status')] === 'removed') continue;
        const next = [...r];
        next[col('status')] = 'removed';
        await this.store.google.sheets.updateRow(this.store.spreadsheetId, gid, i + 1, next);
        return {
          meetingId: String(r[col('meeting_id')]),
          driveId: String(r[col('drive_file_id')]),
        };
      }
      return null;
    });
    if (!found) throw new NotFoundError("We couldn't find that file.");
    // The file is detached whether or not Drive answers; a leftover is only a stray file in the owner's Drive.
    await this.store.google.drive.trashFile(found.driveId).catch((err: unknown) => {
      this.store.logger.warn({ err, fileId }, 'could not move a removed file to the Drive trash');
    });
    await this.store.reloadFiles();
    await this.mirror(found.meetingId, actor);
    return { meetingId: found.meetingId };
  }

  /** Which of these files are still waiting to be saved? Used when a saved draft is restored (§5.7). */
  async check(meetingId: string, fileIds: string[]): Promise<Record<string, boolean>> {
    await this.store.snapshot();
    const live = new Set(
      this.store
        .filesFor(meetingId)
        .filter((f) => f.status !== 'removed')
        .map((f) => f.id),
    );
    return Object.fromEntries(fileIds.map((id) => [id, live.has(id)]));
  }

  /** Writes the view links of the attached files into the meeting's `files` cell. A meeting not saved yet has no cell. */
  private async mirror(meetingId: string, actor: Actor): Promise<void> {
    try {
      await this.meetings.get(meetingId);
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
    await this.meetings.setFilesCell(
      meetingId,
      this.store.attachedFiles(meetingId).map((f) => f.view_link),
      actor,
    );
  }

  /** The hourly job: trash pending files nobody saved within 24 hours. Returns how many. */
  async expirePending(): Promise<number> {
    const gid = await this.filesTab();
    const cutoff = this.store.now().getTime() - PENDING_MAX_AGE_MS;
    const dead = await this.store.mutex.run(await this.key(), async () => {
      const rows = (await this.store.google.sheets.batchGet(this.store.spreadsheetId, [gid]))[gid];
      const header = rows?.[0] ?? [];
      const col = (k: string) => header.indexOf(k);
      const gone: string[] = [];
      for (let i = 1; i < (rows?.length ?? 0); i += 1) {
        const r = rows![i]!;
        if (r[col('status')] !== 'pending') continue;
        const at = Date.parse(String(r[col('uploaded_at')]));
        if (Number.isNaN(at) || at > cutoff) continue;
        const next = [...r];
        next[col('status')] = 'removed';
        await this.store.google.sheets.updateRow(this.store.spreadsheetId, gid, i + 1, next);
        gone.push(String(r[col('drive_file_id')]));
      }
      return gone;
    });
    for (const id of dead) await this.store.google.drive.trashFile(id).catch(() => undefined);
    if (dead.length > 0) await this.store.reloadFiles();
    return dead.length;
  }
}
