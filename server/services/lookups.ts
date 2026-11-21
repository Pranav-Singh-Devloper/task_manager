import { LOOKUP_HEADERS, TAB, rowFromObject } from '../../shared/schema';
import type { Cell, FieldDef, FieldValue } from '../../shared/types';
import type { Config } from './config';
import type { SheetStore } from './store';

const text = (c: Cell | undefined) => (c === null || c === undefined ? '' : String(c).trim());

/** Fields whose dropdown learns: a value typed in that is not on the list is added to it (§9 rule 18). */
export const isLearning = (f: FieldDef) =>
  f.allow_new_options && !f.archived && (f.type === 'select' || f.type === 'multi_select');

/**
 * Puts the most-used values first in every learning dropdown. Ties keep the order they already had,
 * and a value that has never been counted keeps its place after the ones that have.
 */
export function orderOptionsByUse(config: Config, lookupRows: Cell[][]): void {
  const headers = (lookupRows[0] ?? []).map(text);
  const col = (k: string) => headers.indexOf(k);
  const counts = new Map<string, number>();
  for (const r of lookupRows.slice(1)) {
    const key = `${text(r[col('category_slug')])}|${text(r[col('field_key')])}|${text(r[col('value')]).toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + (Number(r[col('count')]) || 0));
  }
  for (const f of config.fields) {
    if (!isLearning(f) || f.options.length < 2) continue;
    const used = (o: string) => counts.get(`${f.category_slug}|${f.key}|${o.toLowerCase()}`) ?? 0;
    f.options = f.options
      .map((o, i) => ({ o, i }))
      .sort((a, b) => used(b.o) - used(a.o) || a.i - b.i)
      .map((x) => x.o);
  }
}

/**
 * After a meeting is saved: counts each value used in a learning dropdown in _lookups, and adds new values to the
 * field's options so the list grows over time. Only the fields in `onlyKeys` are counted (the ones that changed),
 * so editing an unrelated field never inflates a count. Best effort: the meeting is already saved.
 */
export async function learnOptions(
  store: SheetStore,
  slug: string,
  values: Record<string, FieldValue>,
  onlyKeys?: string[],
): Promise<void> {
  const snap = await store.snapshot();
  // Meeting categories and trackers learn new dropdown values the same way.
  const cfg = snap.config.byCategory.get(slug) ?? snap.config.byTracker.get(slug);
  if (!cfg) return;

  const used: { field: FieldDef; value: string }[] = [];
  for (const f of cfg.fields.filter(isLearning)) {
    if (onlyKeys && !onlyKeys.includes(f.key)) continue;
    const v = values[f.key];
    for (const item of Array.isArray(v) ? v : v ? [v] : []) {
      const value = String(item).trim();
      if (value) used.push({ field: f, value });
    }
  }
  if (used.length === 0) return;

  const lookupsTab = snap.tabs.find((t) => t.title === TAB.lookups);
  const fieldsTab = snap.tabs.find((t) => t.title === TAB.fields);
  if (!lookupsTab || !fieldsTab) return;
  const { google, spreadsheetId } = store;
  const now = store.now().toISOString();

  await store.mutex.run(store.tabKey(lookupsTab.gid), async () => {
    const [lookups, fields] = await google.sheets
      .batchGet(spreadsheetId, [lookupsTab.gid, fieldsTab.gid])
      .then((d) => [d[lookupsTab.gid] ?? [], d[fieldsTab.gid] ?? []] as const);
    const lh = LOOKUP_HEADERS as readonly string[];
    const writes: { gid: number; startRow: number; rows: Cell[][] }[] = [];
    const appends: Cell[][] = [];
    let optionsChanged = false;

    for (const { field, value } of used) {
      const index = lookups.findIndex(
        (r, i) =>
          i > 0 &&
          text(r[lh.indexOf('category_slug')]) === slug &&
          text(r[lh.indexOf('field_key')]) === field.key &&
          text(r[lh.indexOf('value')]).toLowerCase() === value.toLowerCase(),
      );
      if (index > 0) {
        const row = lookups[index] as Cell[];
        const next = [...row];
        next[lh.indexOf('count')] = (Number(row[lh.indexOf('count')]) || 0) + 1;
        next[lh.indexOf('last_used')] = now;
        lookups[index] = next;
        writes.push({ gid: lookupsTab.gid, startRow: index + 1, rows: [next] });
      } else {
        const row = rowFromObject(LOOKUP_HEADERS, {
          field_key: field.key,
          category_slug: slug,
          value,
          count: 1,
          last_used: now,
        });
        appends.push(row);
        lookups.push(row); // so a second use in this same save counts against it
      }

      if (!field.options.some((o) => o.toLowerCase() === value.toLowerCase())) {
        const headers = (fields[0] ?? []).map(text);
        const at = (r: Cell[], k: string) => text(r[headers.indexOf(k)]);
        const fi = fields.findIndex(
          (r, i) => i > 0 && at(r, 'category_slug') === slug && at(r, 'key') === field.key,
        );
        if (fi > 0) {
          const row = [...(fields[fi] as Cell[])];
          const current: string[] = (() => {
            try {
              const parsed: unknown = JSON.parse(at(row, 'options') || '[]');
              return Array.isArray(parsed) ? parsed.map(String) : [];
            } catch {
              return [];
            }
          })();
          if (!current.some((o) => o.toLowerCase() === value.toLowerCase())) {
            row[headers.indexOf('options')] = JSON.stringify([...current, value]);
            fields[fi] = row;
            writes.push({ gid: fieldsTab.gid, startRow: fi + 1, rows: [row] });
            field.options = [...field.options, value];
            optionsChanged = true;
          }
        }
      }
    }
    if (writes.length > 0) await google.sheets.writeBlocks(spreadsheetId, writes);
    if (appends.length > 0) await google.sheets.appendRows(spreadsheetId, lookupsTab.gid, appends);
    if (optionsChanged || writes.length > 0 || appends.length > 0) await store.refresh();
  });
}
