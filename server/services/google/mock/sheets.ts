import type { Cell } from '../../../../shared/types';
import { GoogleApiError } from '../errors';
import type { SheetsRepo, TabFormat, TabInfo } from '../types';
import type { FailureInjector } from './failure';
import type { MockSpreadsheet, MockTab, MockWorld } from './world';

const isEmpty = (c: Cell | undefined) => c === null || c === undefined || c === '';

function trimRow(row: Cell[]): Cell[] {
  let end = row.length;
  while (end > 0 && isEmpty(row[end - 1])) end -= 1;
  return row.slice(0, end);
}

/** Like the real API: trailing empty cells and rows are not returned. */
function trimmed(rows: Cell[][]): Cell[][] {
  const out = rows.map(trimRow);
  while (out.length > 0 && out[out.length - 1]?.length === 0) out.pop();
  return out;
}

export class MockSheets implements SheetsRepo {
  constructor(
    private world: MockWorld,
    private failures: FailureInjector,
  ) {}

  private sheet(id: string): MockSpreadsheet {
    const s = this.world.spreadsheets.get(id);
    if (!s) throw new GoogleApiError(404, 'Requested entity was not found.', 'notFound');
    return s;
  }

  private tab(id: string, gid: number): MockTab {
    const t = this.sheet(id).tabs.get(gid);
    if (!t) throw new GoogleApiError(400, `No tab with gid ${gid}`, 'badRequest');
    return t;
  }

  private info(t: MockTab): TabInfo {
    return { gid: t.gid, title: t.title, rowCount: t.rowCount, columnCount: t.columnCount };
  }

  async getTabs(spreadsheetId: string): Promise<TabInfo[]> {
    this.failures.check('sheets');
    return [...this.sheet(spreadsheetId).tabs.values()].map((t) => this.info(t));
  }

  async addTab(spreadsheetId: string, title: string, rows = 1000, columns = 26): Promise<TabInfo> {
    this.failures.check('sheets');
    const s = this.sheet(spreadsheetId);
    if ([...s.tabs.values()].some((t) => t.title === title)) {
      throw new GoogleApiError(
        400,
        `A sheet with the name "${title}" already exists.`,
        'badRequest',
      );
    }
    const tab: MockTab = {
      gid: s.nextGid,
      title,
      rows: [],
      rowCount: rows,
      columnCount: columns,
      format: {},
    };
    s.nextGid += 1;
    s.tabs.set(tab.gid, tab);
    return this.info(tab);
  }

  async renameTab(spreadsheetId: string, gid: number, title: string): Promise<void> {
    this.failures.check('sheets');
    this.tab(spreadsheetId, gid).title = title;
  }

  async batchGet(spreadsheetId: string, gids: number[]): Promise<Record<number, Cell[][]>> {
    this.failures.check('sheets');
    const out: Record<number, Cell[][]> = {};
    for (const gid of gids)
      out[gid] = trimmed(this.tab(spreadsheetId, gid).rows).map((r) => [...r]);
    return out;
  }

  async getRow(spreadsheetId: string, gid: number, row: number): Promise<Cell[]> {
    this.failures.check('sheets');
    return trimRow([...(this.tab(spreadsheetId, gid).rows[row - 1] ?? [])]);
  }

  async appendRows(spreadsheetId: string, gid: number, rows: Cell[][]): Promise<number> {
    this.failures.check('sheets');
    const t = this.tab(spreadsheetId, gid);
    const first = trimmed(t.rows).length + 1;
    t.rows.length = first - 1;
    for (const r of rows) t.rows.push([...r]);
    t.rowCount = Math.max(t.rowCount, t.rows.length);
    t.columnCount = Math.max(t.columnCount, ...rows.map((r) => r.length));
    return first;
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
    this.failures.check('sheets');
    const t = this.tab(spreadsheetId, gid);
    rows.forEach((values, i) => {
      const idx = startRow - 1 + i;
      while (t.rows.length <= idx) t.rows.push([]);
      t.rows[idx] = [...values];
      t.columnCount = Math.max(t.columnCount, values.length);
    });
    t.rowCount = Math.max(t.rowCount, t.rows.length);
  }

  async growGrid(spreadsheetId: string, gid: number, rows: number, columns: number): Promise<void> {
    this.failures.check('sheets');
    const t = this.tab(spreadsheetId, gid);
    t.rowCount = Math.max(t.rowCount, rows);
    t.columnCount = Math.max(t.columnCount, columns);
  }

  async formatTab(spreadsheetId: string, gid: number, format: TabFormat): Promise<void> {
    this.failures.check('sheets');
    const t = this.tab(spreadsheetId, gid);
    t.format = { ...t.format, ...format };
  }
}
