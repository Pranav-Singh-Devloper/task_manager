import type { Cell } from '../../../../shared/types';
import type { CalendarEvent, DriveFile, TabFormat } from '../types';

export interface MockTab {
  gid: number;
  title: string;
  rows: Cell[][];
  rowCount: number;
  columnCount: number;
  format: TabFormat;
}

export interface MockSpreadsheet {
  id: string;
  tabs: Map<number, MockTab>;
  nextGid: number;
}

/** Everything the mock Google account holds. Shared by all mock adapters. */
export class MockWorld {
  spreadsheets = new Map<string, MockSpreadsheet>();
  files = new Map<string, DriveFile>();
  /** calendarId → eventId → event. Deleted events stay with status "cancelled", like Google. */
  calendars = new Map<string, Map<string, CalendarEvent>>();
  outbox: { to: string; subject: string; html: string }[] = [];
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter.toString().padStart(4, '0')}`;
  }
}
