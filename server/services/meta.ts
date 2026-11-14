import {
  parseCategories,
  parseFields,
  parseSettings,
  parseWorkspaces,
} from '../../shared/configRows';
import { TAB } from '../../shared/schema';
import type { CategoryDef, FieldDef, Settings, WorkspaceDef } from '../../shared/types';
import type { GoogleServices } from './google/types';

export interface Meta {
  categories: CategoryDef[];
  fields: FieldDef[];
  workspaces: WorkspaceDef[];
  settings: Settings;
  /** Config rows that were skipped, in plain words. Empty when everything is fine. */
  problems: string[];
}

/** Everything the UI needs to draw forms and tables. Config rows that cannot be read are skipped and reported. */
export async function loadMeta(google: GoogleServices, spreadsheetId: string): Promise<Meta> {
  const tabs = await google.sheets.getTabs(spreadsheetId);
  const gid = (title: string) => tabs.find((t) => t.title === title)?.gid;
  const wanted = [TAB.categories, TAB.fields, TAB.workspaces, TAB.settings].map(gid);
  const [cats, fields, workspaces, settings] = wanted;
  const present = wanted.filter((g): g is number => g !== undefined);
  const data = await google.sheets.batchGet(spreadsheetId, present);
  const rows = (g: number | undefined) => (g === undefined ? [] : (data[g] ?? []));

  const c = parseCategories(rows(cats));
  const f = parseFields(rows(fields));
  const missing = [TAB.categories, TAB.fields, TAB.workspaces, TAB.settings].filter(
    (_, i) => wanted[i] === undefined,
  );
  return {
    categories: c.items,
    fields: f.items,
    workspaces: parseWorkspaces(rows(workspaces)).items,
    settings: parseSettings(rows(settings)),
    problems: [
      ...missing.map((t) => `The ${t} tab is missing from the spreadsheet.`),
      ...c.problems,
      ...f.problems,
    ],
  };
}
