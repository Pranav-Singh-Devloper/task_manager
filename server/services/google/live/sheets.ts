import { google, type sheets_v4 } from 'googleapis';
import type { Cell } from '../../../../shared/types';
import type { SheetsRepo, TabFormat, TabInfo, TabSpec, TabWrite } from '../types';
import { run, type LiveContext } from './call';

/** 'My Tab' → "'My Tab'" with quotes inside doubled, as A1 notation requires. */
export function quoteTab(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** "'CCIE'!A5:AB5" → 5 */
export function firstRowOf(updatedRange: string | null | undefined): number {
  const match = /!\$?[A-Z]+\$?(\d+)/.exec(updatedRange ?? '');
  return match ? Number(match[1]) : 1;
}

/** Groups sorted column indexes into contiguous [start, end) runs. */
export function columnRuns(indexes: number[]): [number, number][] {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const i of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else runs.push([i, i + 1]);
  }
  return runs;
}

/** The batchUpdate requests for one tab's formatting. Pure, so it can be tested without Google. */
export function formatRequests(gid: number, f: TabFormat): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];

  const grid: sheets_v4.Schema$GridProperties = {};
  const fields: string[] = [];
  if (f.frozenRows !== undefined) {
    grid.frozenRowCount = f.frozenRows;
    fields.push('gridProperties.frozenRowCount');
  }
  if (f.frozenColumns !== undefined) {
    grid.frozenColumnCount = f.frozenColumns;
    fields.push('gridProperties.frozenColumnCount');
  }
  if (fields.length > 0) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: gid, gridProperties: grid },
        fields: fields.join(','),
      },
    });
  }

  for (const [start, end] of columnRuns(f.hiddenColumns ?? [])) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: gid, dimension: 'COLUMNS', startIndex: start, endIndex: end },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    });
  }

  for (const [column, note] of Object.entries(f.headerNotes ?? {})) {
    requests.push({
      updateCells: {
        start: { sheetId: gid, rowIndex: 0, columnIndex: Number(column) },
        rows: [{ values: [{ note }] }],
        fields: 'note',
      },
    });
  }

  if (f.protectHeader) {
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1 },
          description: 'Header row. Changing it can stop the app from reading this tab.',
          warningOnly: true,
        },
      },
    });
  }

  // Hiding comes last so a tab is never hidden before the other changes are applied to it.
  if (f.hidden !== undefined) {
    requests.push({
      updateSheetProperties: { properties: { sheetId: gid, hidden: f.hidden }, fields: 'hidden' },
    });
  }
  return requests;
}

type Row = unknown[];

function toCells(rows: Row[] | null | undefined): Cell[][] {
  return (rows ?? []).map((r) =>
    r.map((c) =>
      typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean'
        ? c
        : c == null
          ? null
          : String(c),
    ),
  );
}

const info = (p: sheets_v4.Schema$SheetProperties): TabInfo => ({
  gid: p.sheetId ?? 0,
  title: p.title ?? '',
  rowCount: p.gridProperties?.rowCount ?? 0,
  columnCount: p.gridProperties?.columnCount ?? 0,
});

/** Sheets v4 behind the SheetsRepo interface. Tabs are addressed by gid; titles are looked up and cached. */
export class LiveSheets implements SheetsRepo {
  private titles = new Map<string, Map<number, string>>();

  constructor(private readonly ctx: LiveContext) {}

  private async api(): Promise<sheets_v4.Sheets> {
    return google.sheets({ version: 'v4', auth: await this.ctx.authClient() });
  }

  private remember(spreadsheetId: string, tabs: TabInfo[]): void {
    this.titles.set(spreadsheetId, new Map(tabs.map((t) => [t.gid, t.title])));
  }

  private async titleFor(spreadsheetId: string, gid: number): Promise<string> {
    const cached = this.titles.get(spreadsheetId)?.get(gid);
    if (cached !== undefined) return cached;
    await this.getTabs(spreadsheetId);
    const title = this.titles.get(spreadsheetId)?.get(gid);
    if (title === undefined) throw new Error(`No tab with gid ${gid}`);
    return title;
  }

  async getTabs(spreadsheetId: string): Promise<TabInfo[]> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
      }),
    );
    const tabs = (res.data.sheets ?? []).map((s) => info(s.properties ?? {}));
    this.remember(spreadsheetId, tabs);
    return tabs;
  }

  async addTab(spreadsheetId: string, title: string, rows = 1000, columns = 26): Promise<TabInfo> {
    const [tab] = await this.addTabs(spreadsheetId, [{ title, rows, columns }]);
    return tab as TabInfo;
  }

  async addTabs(spreadsheetId: string, specs: TabSpec[]): Promise<TabInfo[]> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: specs.map((s) => ({
            addSheet: {
              properties: {
                title: s.title,
                gridProperties: { rowCount: s.rows ?? 1000, columnCount: s.columns ?? 26 },
              },
            },
          })),
        },
      }),
    );
    const created = (res.data.replies ?? []).map((r) => info(r.addSheet?.properties ?? {}));
    const known = this.titles.get(spreadsheetId) ?? new Map<number, string>();
    for (const t of created) known.set(t.gid, t.title);
    this.titles.set(spreadsheetId, known);
    return created;
  }

  async renameTab(spreadsheetId: string, gid: number, title: string): Promise<void> {
    const api = await this.api();
    await run(this.ctx, () =>
      api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { updateSheetProperties: { properties: { sheetId: gid, title }, fields: 'title' } },
          ],
        },
      }),
    );
    this.titles.get(spreadsheetId)?.set(gid, title);
  }

  async batchGet(spreadsheetId: string, gids: number[]): Promise<Record<number, Cell[][]>> {
    const ranges = await Promise.all(
      gids.map(async (gid) => quoteTab(await this.titleFor(spreadsheetId, gid))),
    );
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      }),
    );
    const out: Record<number, Cell[][]> = {};
    gids.forEach((gid, i) => {
      out[gid] = toCells(res.data.valueRanges?.[i]?.values as Row[] | undefined);
    });
    return out;
  }

  async getRow(spreadsheetId: string, gid: number, row: number): Promise<Cell[]> {
    const title = quoteTab(await this.titleFor(spreadsheetId, gid));
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.spreadsheets.values.get({
        spreadsheetId,
        range: `${title}!A${row}:ZZ${row}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    );
    return toCells(res.data.values as Row[] | undefined)[0] ?? [];
  }

  async appendRows(spreadsheetId: string, gid: number, rows: Cell[][]): Promise<number> {
    const title = quoteTab(await this.titleFor(spreadsheetId, gid));
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.spreadsheets.values.append({
        spreadsheetId,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      }),
    );
    return firstRowOf(res.data.updates?.updatedRange);
  }

  async updateRow(spreadsheetId: string, gid: number, row: number, values: Cell[]): Promise<void> {
    await this.updateRows(spreadsheetId, gid, row, [values]);
  }

  async updateRows(
    spreadsheetId: string,
    gid: number,
    startRow: number,
    rows: Cell[][],
  ): Promise<void> {
    await this.writeBlocks(spreadsheetId, [{ gid, startRow, rows }]);
  }

  async writeBlocks(spreadsheetId: string, blocks: TabWrite[]): Promise<void> {
    const data = await Promise.all(
      blocks.map(async (b) => ({
        range: `${quoteTab(await this.titleFor(spreadsheetId, b.gid))}!A${b.startRow}`,
        values: b.rows,
      })),
    );
    const api = await this.api();
    // RAW: text that starts with = + - or @ is stored as text and never evaluated as a formula.
    await run(this.ctx, () =>
      api.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data },
      }),
    );
  }

  async deleteRow(spreadsheetId: string, gid: number, row: number): Promise<void> {
    const api = await this.api();
    await run(this.ctx, () =>
      api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: { sheetId: gid, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
              },
            },
          ],
        },
      }),
    );
  }

  async growGrid(spreadsheetId: string, gid: number, rows: number, columns: number): Promise<void> {
    const tabs = await this.getTabs(spreadsheetId);
    const tab = tabs.find((t) => t.gid === gid);
    const rowCount = Math.max(tab?.rowCount ?? 0, rows);
    const columnCount = Math.max(tab?.columnCount ?? 0, columns);
    if (tab && rowCount === tab.rowCount && columnCount === tab.columnCount) return;
    const api = await this.api();
    await run(this.ctx, () =>
      api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId: gid, gridProperties: { rowCount, columnCount } },
                fields: 'gridProperties.rowCount,gridProperties.columnCount',
              },
            },
          ],
        },
      }),
    );
  }

  async formatTab(spreadsheetId: string, gid: number, format: TabFormat): Promise<void> {
    await this.formatTabs(spreadsheetId, [{ gid, format }]);
  }

  async formatTabs(
    spreadsheetId: string,
    items: { gid: number; format: TabFormat }[],
  ): Promise<void> {
    const requests = items.flatMap((i) => formatRequests(i.gid, i.format));
    if (requests.length === 0) return;
    const api = await this.api();
    await run(this.ctx, () =>
      api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }),
    );
  }
}
