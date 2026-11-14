import type { Readable } from 'node:stream';
import { addHours, format, parse } from 'date-fns';
import { calendarEventIdFor, newId } from '../../shared/ids';
import { FILE_HEADERS, TAB, rowFromObject } from '../../shared/schema';
import type { Cell } from '../../shared/types';
import { driveFileName } from '../lib/upload';
import { buildEventPayload, parseReminders } from './calendarEvent';
import { upsertEvent } from './calendarSync';
import type { GoogleServices } from './google/types';

/**
 * M1's working slice: one meeting goes App → Sheet → Calendar → Drive in live mode, in the "Others" category.
 * M3 and M5 replace this with the real meeting service. The order is the real one: the Sheet is saved first,
 * and a Calendar or Drive failure never blocks the save.
 */
export interface SpikeInput {
  id: string;
  topic: string;
  date: string;
  startTime: string;
  durationMin: number;
  createdBy: string;
  file?: { name: string; mimeType: string; stream: Readable };
}

export interface SpikeContext {
  spreadsheetId: string;
  rootFolderId: string;
  timezone: string;
  appUrl: string;
  calendarId: string;
  defaultReminders: string;
}

export interface SpikeResult {
  id: string;
  /** True when this id was already saved, so nothing new was created (safe retry). */
  existing: boolean;
  sheetRow: number;
  calendar: 'ok' | 'error';
  calendarEventId: string;
  file?: { name: string; viewLink: string };
  fileError?: string;
}

const SLUG = 'others';
const CATEGORY_NAME = 'Others';

export async function createSpikeMeeting(
  google: GoogleServices,
  ctx: SpikeContext,
  input: SpikeInput,
): Promise<SpikeResult> {
  const tabs = await google.sheets.getTabs(ctx.spreadsheetId);
  const tab = tabs.find((t) => t.title === CATEGORY_NAME);
  const filesTab = tabs.find((t) => t.title === TAB.files);
  if (!tab) throw new Error('The Others tab was not found in the spreadsheet.');
  const rows = (await google.sheets.batchGet(ctx.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
  const headers = (rows[0] ?? []).map(String);

  const idCol = headers.indexOf('id');
  const eventId = calendarEventIdFor(input.id);
  const existingIndex = rows.findIndex((r, i) => i > 0 && r[idCol] === input.id);
  if (existingIndex > 0) {
    const row = rows[existingIndex] ?? [];
    const sync = row[headers.indexOf('calendar_sync')];
    return {
      id: input.id,
      existing: true,
      sheetRow: existingIndex + 1,
      calendar: sync === 'ok' ? 'ok' : 'error',
      calendarEventId: eventId,
    };
  }

  const srCol = headers.indexOf('sr_no');
  const sr = rows.slice(1).reduce((max, r) => Math.max(max, Number(r[srCol]) || 0), 0) + 1;
  const start = parse(`${input.date} ${input.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
  const endTime = format(addHours(start, input.durationMin / 60), 'HH:mm');
  const now = new Date().toISOString();

  const record: Record<string, Cell> = {
    sr_no: sr,
    date: input.date,
    start_time: input.startTime,
    end_time: endTime,
    topic: input.topic,
    meeting_status: 'Scheduled',
    workspace: 'nhai',
    id: input.id,
    rev: 1,
    created_at: now,
    updated_at: now,
    created_by: input.createdBy,
    calendar_sync: 'pending',
  };

  // 1. Sheet first.
  const sheetRow = await google.sheets.appendRows(ctx.spreadsheetId, tab.gid, [
    rowFromObject(headers, record),
  ]);
  const save = async () =>
    google.sheets.updateRow(ctx.spreadsheetId, tab.gid, sheetRow, rowFromObject(headers, record));

  // 2. Calendar. A failure leaves the meeting saved and marked for retry.
  let calendar: SpikeResult['calendar'] = 'ok';
  try {
    const payload = buildEventPayload({
      meetingId: input.id,
      categorySlug: SLUG,
      categoryName: CATEGORY_NAME,
      title: input.topic,
      date: input.date,
      startTime: input.startTime,
      endTime,
      timezone: ctx.timezone,
      appUrl: ctx.appUrl,
      reminderMinutes: parseReminders(undefined, ctx.defaultReminders),
    });
    await upsertEvent(google.calendar, ctx.calendarId, payload);
    record.calendar_event_id = eventId;
    record.calendar_sync = 'ok';
  } catch {
    calendar = 'error';
    record.calendar_sync = 'error';
  }

  // 3. Drive. Same rule: the meeting is already saved.
  let file: SpikeResult['file'];
  let fileError: string | undefined;
  if (input.file) {
    try {
      const year = input.date.slice(0, 4);
      const categoryFolder = await google.drive.ensureFolder(CATEGORY_NAME, ctx.rootFolderId);
      const yearFolder = await google.drive.ensureFolder(year, categoryFolder.id);
      const name = driveFileName(input.date, input.topic, input.file.name);
      const uploaded = await google.drive.uploadFile({
        name,
        mimeType: input.file.mimeType,
        parentId: yearFolder.id,
        stream: input.file.stream,
        appProperties: { app: 'meetings-manager', role: 'attachment', meetingId: input.id },
      });
      file = { name, viewLink: uploaded.webViewLink };
      record.files = uploaded.webViewLink;
      if (filesTab) {
        await google.sheets.appendRows(ctx.spreadsheetId, filesTab.gid, [
          rowFromObject(FILE_HEADERS, {
            id: newId(),
            meeting_id: input.id,
            category_slug: SLUG,
            name,
            mime: input.file.mimeType,
            size: uploaded.size ?? 0,
            drive_file_id: uploaded.id,
            view_link: uploaded.webViewLink,
            status: 'attached',
            uploaded_at: new Date().toISOString(),
          }),
        ]);
      }
    } catch (err) {
      fileError = err instanceof Error ? err.message : 'The file could not be saved.';
      input.file.stream.resume();
    }
  }

  // 4. Record how it went on the row.
  record.updated_at = new Date().toISOString();
  await save();
  return {
    id: input.id,
    existing: false,
    sheetRow,
    calendar,
    calendarEventId: eventId,
    file,
    fileError,
  };
}
