import ExcelJS from 'exceljs';
import type { Cell } from '../../../shared/types';
import type { SheetStore } from '../store';
import { readTable } from './tables';

/**
 * Text that starts with = + - or @ would run as a formula when the file is opened in Excel (§10).
 * A leading apostrophe-style tab keeps it as plain text. Negative numbers stay numbers.
 */
export function neutralise(value: Cell): Cell {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const csvCell = (v: Cell) => {
  const s = String(neutralise(v) ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function everything(store: SheetStore, name: string) {
  const data = await readTable(store, name, { limit: 1_000_000, offset: 0 });
  const header = data.columns.map((c) => c.key);
  const rows = data.rows.map((r) => header.map((h) => r[h] ?? ''));
  return { header, rows };
}

export async function exportCsv(store: SheetStore, name: string): Promise<string> {
  const { header, rows } = await everything(store, name);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function exportXlsx(store: SheetStore, name: string): Promise<Buffer> {
  const { header, rows } = await everything(store, name);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name.slice(0, 31));
  sheet.addRow(header);
  for (const r of rows) sheet.addRow(r.map((v) => neutralise(v)));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await book.xlsx.writeBuffer());
}
