import { CATEGORY_PALETTE, coreFields } from '../../shared/seed';
import {
  SYSTEM_COLUMNS,
  TAB,
  categoryTabHeaders,
  categoryToRow,
  fieldToRow,
  sheetTitleFor,
} from '../../shared/schema';
import type { CategoryDef } from '../../shared/types';
import { ValidationFailed } from '../lib/errors';
import type { Actor } from './meetings';
import type { SheetStore } from './store';

const MAX_NAME = 60;

/** "Site Visits" → "site_visits". Always starts with a letter, so it is a valid column-style key. */
export function slugFor(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(base) ? base : `c_${base || 'category'}`;
}

/**
 * The "+ Add new category" tile (§6.7): a name and a colour make a new category with its own Sheet tab and the
 * core columns. The owner can add more columns later. Nothing is deleted or changed in existing categories.
 */
export async function createCategory(
  store: SheetStore,
  input: { name: string; color: string },
  actor: Actor,
): Promise<CategoryDef> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const issues = [];
  if (!name) issues.push({ field: 'name', message: 'Please give the category a name.' });
  else if (name.length > MAX_NAME)
    issues.push({ field: 'name', message: `Please keep the name under ${MAX_NAME} characters.` });
  if (!(CATEGORY_PALETTE as readonly string[]).includes(input.color)) {
    issues.push({ field: 'color', message: 'Please choose a colour from the list.' });
  }
  const snap = await store.snapshot();
  if (name && snap.config.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    issues.push({ field: 'name', message: `A category called "${name}" already exists.` });
  }
  if (issues.length > 0) throw new ValidationFailed(issues);

  return store.mutex.run(`${store.spreadsheetId}:categories`, async () => {
    // Re-read inside the lock so two people adding categories at once cannot pick the same slug or tab name.
    const fresh = await store.refresh();
    const takenSlugs = new Set(fresh.config.categories.map((c) => c.slug));
    const takenTabs = new Set(fresh.tabs.map((t) => t.title.toLowerCase()));
    let slug = slugFor(name);
    for (let n = 2; takenSlugs.has(slug); n += 1) slug = `${slugFor(name)}_${n}`;
    let title = sheetTitleFor(name);
    for (let n = 2; takenTabs.has(title.toLowerCase()); n += 1)
      title = `${sheetTitleFor(name)} ${n}`;

    const createdAt = store.now().toISOString();
    const fields = coreFields(slug, false, createdAt);
    const headers = categoryTabHeaders(fields);
    const { google, spreadsheetId } = store;

    const [tab] = await google.sheets.addTabs(spreadsheetId, [
      { title, rows: 1000, columns: Math.max(26, headers.length) },
    ]);
    if (!tab) throw new Error('The new tab could not be created.');
    const category: CategoryDef = {
      slug,
      name,
      color: input.color,
      sort: fresh.config.categories.reduce((m, c) => Math.max(m, c.sort), 0) + 1,
      active: true,
      default_workspace: fresh.config.workspaces[0]?.slug ?? 'nhai',
      title_template: '',
      sheet_gid: tab.gid,
      is_seed: false,
      created_at: createdAt,
    };
    await google.sheets.writeBlocks(spreadsheetId, [
      { gid: tab.gid, startRow: 1, rows: [headers] },
    ]);
    await google.sheets.formatTabs(spreadsheetId, [
      {
        gid: tab.gid,
        format: {
          frozenRows: 1,
          protectHeader: true,
          hiddenColumns: SYSTEM_COLUMNS.map((_, i) => headers.length - SYSTEM_COLUMNS.length + i),
        },
      },
    ]);

    const tabOf = (title: string) => fresh.tabs.find((t) => t.title === title);
    const categories = tabOf(TAB.categories);
    const fieldsTab = tabOf(TAB.fields);
    if (!categories || !fieldsTab) throw new Error('The category settings tabs were not found.');
    await google.sheets.appendRows(spreadsheetId, categories.gid, [categoryToRow(category)]);
    await google.sheets.appendRows(spreadsheetId, fieldsTab.gid, fields.map(fieldToRow));

    await store.log.audit({
      user: actor.email,
      action: 'config',
      table: TAB.categories,
      rowId: slug,
      source: actor.source,
      changes: { name: [null, name], color: [null, input.color] },
    });
    await store.refresh();
    return category;
  });
}
