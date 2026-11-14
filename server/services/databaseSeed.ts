import { buildSeedConfig, type SeedConfig } from '../../shared/seed';
import {
  FIXED_TAB_HEADERS,
  SCHEMA_VERSION,
  SYSTEM_COLUMNS,
  TAB,
  categoryTabHeaders,
  categoryToRow,
  fieldToRow,
  workspaceToRow,
} from '../../shared/schema';
import type { Cell } from '../../shared/types';
import type { GoogleServices } from './google/types';

export const DATABASE_NAME = 'Meetings Manager — Database';
export const DATABASE_APP_PROPERTIES = { app: 'meetings-manager', role: 'database' } as const;

export interface CreatedDatabase {
  spreadsheetId: string;
  config: SeedConfig;
  /** Header row of each category tab, by category slug. */
  headers: Record<string, string[]>;
}

/**
 * Creates the database spreadsheet with every tab, header row, formatting and the seed config (§5.5 step 2).
 * Safe to call on a fresh account only: bootstrap decides whether a database already exists.
 */
export async function createDatabase(
  google: Pick<GoogleServices, 'drive' | 'sheets'>,
  now: Date,
): Promise<CreatedDatabase> {
  const createdAt = now.toISOString();
  const config = buildSeedConfig(createdAt);
  const file = await google.drive.createSpreadsheetFile(DATABASE_NAME, {
    ...DATABASE_APP_PROPERTIES,
  });
  const id = file.id;

  const headers: Record<string, string[]> = {};
  const tabs: {
    title: string;
    headers: string[];
    computedCols: number[];
    systemFrom: number | null;
    hidden: boolean;
  }[] = [];

  for (const cat of config.categories) {
    const catFields = config.fields.filter((f) => f.category_slug === cat.slug);
    const h = categoryTabHeaders(catFields);
    headers[cat.slug] = h;
    const computedCols = h
      .map((key, i) => (catFields.find((f) => f.key === key)?.type === 'computed' ? i : -1))
      .filter((i) => i >= 0);
    tabs.push({
      title: config.tabTitles[cat.slug] as string,
      headers: h,
      computedCols,
      systemFrom: h.length - SYSTEM_COLUMNS.length,
      hidden: false,
    });
  }
  for (const [title, h] of Object.entries(FIXED_TAB_HEADERS)) {
    tabs.push({
      title,
      headers: [...h],
      computedCols: [],
      systemFrom: null,
      hidden: title === TAB.system,
    });
  }

  // The new spreadsheet's first tab (gid 0) becomes the first category tab; the rest are added in one call.
  const gids = new Map<string, number>();
  const [first, ...rest] = tabs;
  await google.sheets.renameTab(id, 0, (first as (typeof tabs)[number]).title);
  gids.set((first as (typeof tabs)[number]).title, 0);
  const created = await google.sheets.addTabs(
    id,
    rest.map((t) => ({ title: t.title, rows: 1000, columns: Math.max(26, t.headers.length) })),
  );
  for (const info of created) gids.set(info.title, info.gid);
  for (const cat of config.categories)
    cat.sheet_gid = gids.get(config.tabTitles[cat.slug] as string) ?? null;

  const fixedRows: Record<string, Cell[][]> = {
    [TAB.workspaces]: config.workspaces.map(workspaceToRow),
    [TAB.categories]: config.categories.map(categoryToRow),
    [TAB.fields]: config.fields.map(fieldToRow),
    [TAB.settings]: Object.entries(config.settings).map(([k, v]) => [k, v]),
    [TAB.system]: [
      ['schema_version', SCHEMA_VERSION],
      ['calendar_sync_token', ''],
    ],
  };

  await google.sheets.writeBlocks(
    id,
    tabs.map((tab) => ({
      gid: gids.get(tab.title) as number,
      startRow: 1,
      rows: [tab.headers, ...(fixedRows[tab.title] ?? [])],
    })),
  );
  await google.sheets.formatTabs(
    id,
    tabs.map((tab) => ({
      gid: gids.get(tab.title) as number,
      format: {
        frozenRows: 1,
        protectHeader: true,
        hidden: tab.hidden,
        hiddenColumns:
          tab.systemFrom === null
            ? []
            : SYSTEM_COLUMNS.map((_, i) => (tab.systemFrom as number) + i),
        headerNotes: Object.fromEntries(tab.computedCols.map((c) => [c, 'Calculated in the app'])),
      },
    })),
  );

  return { spreadsheetId: id, config, headers };
}
