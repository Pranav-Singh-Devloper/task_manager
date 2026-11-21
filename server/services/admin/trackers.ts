import { CATEGORY_PALETTE, makeField } from '../../../shared/seed';
import {
  SYSTEM_COLUMNS,
  TAB,
  categoryTabHeaders,
  fieldToRow,
  sheetTitleFor,
  trackerToRow,
} from '../../../shared/schema';
import { parseTrackers } from '../../../shared/configRows';
import { fullRoles } from '../../../shared/trackerSeed';
import type { FieldDef, TrackerDef, TrackerRoles, ValidationIssue } from '../../../shared/types';
import { NotFoundError, ValidationFailed } from '../../lib/errors';
import { slugFor } from '../categories';
import type { Actor } from '../meetings';
import type { SheetStore } from '../store';

const MAX_NAME = 40;

export interface NewTrackerInput {
  name: string;
  /** What one row is called, for "Add …" buttons: "project", "case", "visit". */
  item_name: string;
  color: string;
}

function checkNames(
  name: string,
  itemName: string,
  issues: ValidationIssue[],
): { name: string; itemName: string } {
  const n = name.trim().replace(/\s+/g, ' ');
  const i = itemName.trim().replace(/\s+/g, ' ');
  if (!n) issues.push({ field: 'name', message: 'Please give the list a name.' });
  else if (n.length > MAX_NAME)
    issues.push({ field: 'name', message: `Please keep the name under ${MAX_NAME} characters.` });
  if (!i) issues.push({ field: 'item_name', message: 'Please say what one row is called.' });
  else if (i.length > MAX_NAME)
    issues.push({
      field: 'item_name',
      message: `Please keep it under ${MAX_NAME} characters.`,
    });
  return { name: n, itemName: i };
}

/**
 * "ADD++" in the owner's sketch: a new list with its own Sheet tab. It starts with a name, a status, a due date and
 * remarks, so its dashboard works at once (open, overdue, due soon, done); more columns are added in Admin.
 */
export async function createTracker(
  store: SheetStore,
  input: NewTrackerInput,
  actor: Actor,
): Promise<TrackerDef> {
  const issues: ValidationIssue[] = [];
  const { name, itemName } = checkNames(input.name, input.item_name, issues);
  if (!(CATEGORY_PALETTE as readonly string[]).includes(input.color))
    issues.push({ field: 'color', message: 'Please choose a colour from the list.' });
  const first = await store.snapshot();
  const clash = [...first.config.trackers, ...first.config.categories].find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  if (name && clash)
    issues.push({ field: 'name', message: `Something called "${name}" already exists.` });
  if (issues.length > 0) throw new ValidationFailed(issues);

  return store.mutex.run(`${store.spreadsheetId}:categories`, async () => {
    const fresh = await store.refresh();
    const trackersTab = fresh.tabs.find((t) => t.title === TAB.trackers);
    const fieldsTab = fresh.tabs.find((t) => t.title === TAB.fields);
    if (!trackersTab || !fieldsTab) throw new Error('The list settings tabs were not found.');
    const listed = parseTrackers(
      (await store.google.sheets.batchGet(store.spreadsheetId, [trackersTab.gid]))[
        trackersTab.gid
      ] ?? [],
    ).items;
    // "new" is the address of this very page (/trackers/new), so a list can never be called that.
    const takenSlugs = new Set([
      'new',
      ...listed.map((t) => t.slug),
      ...fresh.config.categories.map((c) => c.slug),
    ]);
    const takenTabs = new Set(fresh.tabs.map((t) => t.title.toLowerCase()));
    let slug = slugFor(name);
    for (let n = 2; takenSlugs.has(slug); n += 1) slug = `${slugFor(name)}_${n}`;
    let title = sheetTitleFor(name);
    for (let n = 2; takenTabs.has(title.toLowerCase()); n += 1)
      title = `${sheetTitleFor(name)} ${n}`;

    const createdAt = store.now().toISOString();
    const fields: FieldDef[] = [
      {
        key: 'sr_no',
        label: 'Sl No',
        type: 'auto_number' as const,
        locked: true,
        show_in_form: false,
      },
      { key: 'name', label: 'Name', type: 'text' as const, required: true, locked: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select' as const,
        options: ['Open', 'Done'],
        allow_new_options: true,
        default_value: 'Open',
        show_in_table: true,
      },
      { key: 'due_date', label: 'Due date', type: 'date' as const, show_in_table: true },
      { key: 'remarks', label: 'Remarks', type: 'long_text' as const },
    ].map((spec, i) => makeField(slug, (i + 1) * 10, createdAt, spec));
    const headers = categoryTabHeaders(fields);
    const { google, spreadsheetId } = store;
    const [tab] = await google.sheets.addTabs(spreadsheetId, [
      { title, rows: 1000, columns: Math.max(26, headers.length) },
    ]);
    if (!tab) throw new Error('The new tab could not be created.');
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
    const tracker: TrackerDef = {
      slug,
      name,
      item_name: itemName,
      kind: 'custom',
      color: input.color,
      sort: listed.reduce((m, t) => Math.max(m, t.sort), 0) + 1,
      active: true,
      sheet_gid: tab.gid,
      settings: {
        roles: fullRoles({
          title_key: 'name',
          status_key: 'status',
          closed_values: ['Done'],
          due_key: 'due_date',
        }),
        targets: { km: null, cr: null },
        calendar: false,
      },
      is_seed: false,
      created_at: createdAt,
    };
    await google.sheets.appendRows(spreadsheetId, fieldsTab.gid, fields.map(fieldToRow));
    await google.sheets.appendRows(spreadsheetId, trackersTab.gid, [trackerToRow(tracker)]);
    await store.log.audit({
      user: actor.email,
      action: 'config',
      table: TAB.trackers,
      rowId: slug,
      source: actor.source,
      changes: { name: [null, name] },
    });
    await store.refresh();
    return tracker;
  });
}

export interface TrackerPatch {
  name?: string;
  item_name?: string;
  color?: string;
  active?: boolean;
  /** Put the date that matters on Google Calendar. */
  calendar?: boolean;
  roles?: Partial<TrackerRoles>;
}

/** Changes a list's name, colour or column roles. Roles must point at columns of the right kind. */
export async function updateTracker(
  store: SheetStore,
  slug: string,
  patch: TrackerPatch,
  actor: Actor,
): Promise<TrackerDef> {
  const snap = await store.snapshot();
  const cfg = snap.config.byTracker.get(slug);
  if (!cfg) throw new NotFoundError("We couldn't find that list.");
  const issues: ValidationIssue[] = [];
  const current = cfg.tracker;
  const { name, itemName } = checkNames(
    patch.name ?? current.name,
    patch.item_name ?? current.item_name,
    issues,
  );
  if (patch.color !== undefined && !(CATEGORY_PALETTE as readonly string[]).includes(patch.color))
    issues.push({ field: 'color', message: 'Please choose a colour from the list.' });
  if (
    patch.name !== undefined &&
    [...snap.config.trackers, ...snap.config.categories].some(
      (x) => x.slug !== slug && x.name.toLowerCase() === name.toLowerCase(),
    )
  )
    issues.push({ field: 'name', message: `Something called "${name}" already exists.` });

  const roles: TrackerRoles = { ...current.settings.roles, ...(patch.roles ?? {}) };
  const live = cfg.fields.filter((f) => !f.archived);
  const fieldOf = (key: string) => live.find((f) => f.key === key);
  const need = (
    key: string,
    field: keyof TrackerRoles,
    ok: (f: FieldDef) => boolean,
    what: string,
  ) => {
    if (!key) return;
    const f = fieldOf(key);
    if (!f || !ok(f)) issues.push({ field, message: what });
  };
  need(
    roles.title_key,
    'title_key',
    (f) => f.type === 'text',
    'The name column must be a short text column.',
  );
  need(
    roles.status_key,
    'status_key',
    (f) => f.type === 'select',
    'The status column must be a "Choose one" column.',
  );
  need(
    roles.due_key,
    'due_key',
    (f) => f.type === 'date',
    'The date that matters must be a date column.',
  );
  need(
    roles.group_key,
    'group_key',
    (f) => f.type === 'select' || f.type === 'text',
    'Group by a "Choose one" or short text column.',
  );
  need(
    roles.done_date_key,
    'done_date_key',
    (f) => f.type === 'date',
    'Please choose a date column.',
  );
  need(
    roles.stage_key,
    'stage_key',
    (f) => f.type === 'select',
    'The stage column must be a "Choose one" column.',
  );
  need(
    roles.stages_key,
    'stages_key',
    (f) => f.type === 'stages',
    'Please choose a States column.',
  );
  roles.sum_keys = [...new Set(roles.sum_keys)].slice(0, 2);
  for (const k of roles.sum_keys)
    need(k, 'sum_keys', (f) => f.type === 'number', 'Only number columns can be added up.');
  roles.closed_values = [...new Set(roles.closed_values.map((v) => v.trim()).filter(Boolean))];
  if (issues.length > 0) throw new ValidationFailed(issues);

  const next: TrackerDef = {
    ...current,
    name,
    item_name: itemName,
    color: patch.color ?? current.color,
    active: patch.active ?? current.active,
    settings: { ...current.settings, roles, calendar: patch.calendar ?? current.settings.calendar },
  };
  const tab = snap.tabs.find((t) => t.title === TAB.trackers);
  if (!tab) throw new NotFoundError("We couldn't find that list.");
  await store.mutex.run(store.tabKey(tab.gid), async () => {
    const rows =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    const index = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === slug);
    if (index < 0) throw new NotFoundError("We couldn't find that list.");
    // Keep the targets as they are in the Sheet now: they are changed on the list's own page.
    const live = parseTrackers([rows[0] ?? [], rows[index] ?? []]).items[0];
    const merged = live
      ? { ...next, settings: { ...next.settings, targets: live.settings.targets } }
      : next;
    await store.google.sheets.updateRow(
      store.spreadsheetId,
      tab.gid,
      index + 1,
      trackerToRow(merged),
    );
  });
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of ['name', 'item_name', 'color', 'active'] as const)
    if (current[k] !== next[k]) changes[k] = [current[k], next[k]];
  if (current.settings.calendar !== next.settings.calendar)
    changes.calendar = [current.settings.calendar, next.settings.calendar];
  if (JSON.stringify(current.settings.roles) !== JSON.stringify(roles))
    changes.roles = [JSON.stringify(current.settings.roles), JSON.stringify(roles)];
  if (Object.keys(changes).length > 0)
    await store.log.audit({
      user: actor.email,
      action: 'config',
      table: TAB.trackers,
      rowId: slug,
      source: actor.source,
      changes,
    });
  await store.refresh();
  return next;
}
