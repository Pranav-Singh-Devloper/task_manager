import { parseFields, parseTrackers } from '../../shared/configRows';
import {
  SYSTEM_COLUMNS,
  TAB,
  TRACKER_HEADERS,
  categoryTabHeaders,
  fieldToRow,
  trackerToRow,
} from '../../shared/schema';
import { buildSeedTrackers } from '../../shared/trackerSeed';
import type { Cell } from '../../shared/types';
import type { GoogleServices } from './google/types';

type Google = Pick<GoogleServices, 'sheets' | 'drive'>;

/**
 * Version 2: trackers. Adds the _trackers tab and the starting trackers (Award Plan, Discussions, DPR, Track and
 * Under Observation), each with its own tab and its columns in _fields. Safe to run twice: a tracker that is
 * already listed is left alone, and a half-finished run is completed rather than repeated.
 */
export async function addTrackers(google: Google, spreadsheetId: string): Promise<void> {
  const { sheets } = google;
  let tabs = await sheets.getTabs(spreadsheetId);
  if (!tabs.some((t) => t.title === TAB.fields)) return;

  if (!tabs.some((t) => t.title === TAB.trackers)) {
    const [made] = await sheets.addTabs(spreadsheetId, [
      { title: TAB.trackers, rows: 100, columns: TRACKER_HEADERS.length },
    ]);
    const gid = (made as { gid: number }).gid;
    await sheets.writeBlocks(spreadsheetId, [{ gid, startRow: 1, rows: [[...TRACKER_HEADERS]] }]);
    await sheets.formatTabs(spreadsheetId, [
      { gid, format: { frozenRows: 1, protectHeader: true } },
    ]);
    tabs = await sheets.getTabs(spreadsheetId);
  }

  const gidOf = (title: string) => tabs.find((t) => t.title === title)?.gid;
  const trackersGid = gidOf(TAB.trackers) as number;
  const fieldsGid = gidOf(TAB.fields);
  // Not a full database (an empty file someone pointed SPREADSHEET_ID at): there is nothing to add trackers to.
  if (fieldsGid === undefined) return;

  const read = await sheets.batchGet(spreadsheetId, [trackersGid, fieldsGid]);
  const listed = new Set(parseTrackers(read[trackersGid] ?? []).items.map((t) => t.slug));
  const existingFields = new Set(
    parseFields(read[fieldsGid] ?? []).items.map((f) => `${f.category_slug}:${f.key}`),
  );

  const createdAt = new Date().toISOString();
  const maxSort = parseTrackers(read[trackersGid] ?? []).items.reduce(
    (m, t) => Math.max(m, t.sort),
    0,
  );
  const todo = buildSeedTrackers(createdAt, maxSort + 1).filter((s) => !listed.has(s.tracker.slug));
  if (todo.length === 0) return;

  // Each tracker gets its tab. An empty tab with the same title (left by an interrupted run) is reused.
  const contents = await sheets.batchGet(
    spreadsheetId,
    todo.map((s) => gidOf(s.tabTitle)).filter((g): g is number => g !== undefined),
  );
  const titles = new Set(tabs.map((t) => t.title));
  const toAdd: { title: string; seed: (typeof todo)[number] }[] = [];
  const gids = new Map<string, number>();
  for (const s of todo) {
    const same = gidOf(s.tabTitle);
    if (same !== undefined && (contents[same] ?? []).length <= 1) {
      gids.set(s.tracker.slug, same);
      continue;
    }
    let title = s.tabTitle;
    for (let n = 2; titles.has(title); n++) title = `${s.tabTitle} ${n}`;
    titles.add(title);
    toAdd.push({ title, seed: s });
  }
  if (toAdd.length > 0) {
    const made = await sheets.addTabs(
      spreadsheetId,
      toAdd.map((a) => ({
        title: a.title,
        rows: 1000,
        columns: Math.max(26, categoryTabHeaders(a.seed.fields).length),
      })),
    );
    for (const info of made) {
      const match = toAdd.find((a) => a.title === info.title);
      if (match) gids.set(match.seed.tracker.slug, info.gid);
    }
  }

  const blocks = todo.map((s) => ({
    gid: gids.get(s.tracker.slug) as number,
    startRow: 1,
    rows: [categoryTabHeaders(s.fields)] as Cell[][],
  }));
  await sheets.writeBlocks(spreadsheetId, blocks);
  await sheets.formatTabs(
    spreadsheetId,
    todo.map((s) => {
      const headers = categoryTabHeaders(s.fields);
      const systemFrom = headers.length - SYSTEM_COLUMNS.length;
      return {
        gid: gids.get(s.tracker.slug) as number,
        format: {
          frozenRows: 1,
          protectHeader: true,
          hiddenColumns: SYSTEM_COLUMNS.map((_, i) => systemFrom + i),
        },
      };
    }),
  );

  const newFields = todo
    .flatMap((s) => s.fields)
    .filter((f) => !existingFields.has(`${f.category_slug}:${f.key}`));
  if (newFields.length > 0)
    await sheets.appendRows(spreadsheetId, fieldsGid, newFields.map(fieldToRow));
  // The tracker rows go last: once a tracker is listed, the app uses it.
  await sheets.appendRows(
    spreadsheetId,
    trackersGid,
    todo.map((s) => trackerToRow({ ...s.tracker, sheet_gid: gids.get(s.tracker.slug) ?? null })),
  );
}
