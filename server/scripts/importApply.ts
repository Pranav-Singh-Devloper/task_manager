import { CATEGORY_PALETTE } from '../../shared/seed';
import { ValidationFailed } from '../lib/errors';
import { createCategory } from '../services/categories';
import { addField, updateField } from '../services/admin/columns';
import { createTracker, updateTracker } from '../services/admin/trackers';
import type { DataContext } from '../services/data';
import type { Actor } from '../services/meetings';
import { updateSettings } from '../services/settings';
import type { ImportPlan } from './importPlan';

export const IMPORT_ACTOR: Actor = { email: 'import from the previous database', source: 'admin' };

/** Writes an import plan into the current database through the app's services. Returns what could not be copied. */
export async function applyPlan(
  plan: ImportPlan,
  ctx: DataContext,
  options: { pauseMs?: number; log?: (line: string) => void } = {},
): Promise<string[]> {
  const actor = IMPORT_ACTOR;
  const pause = options.pauseMs ?? 0;
  const console = { log: options.log ?? (() => undefined) };
  const sleep = (ms: number) =>
    ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  const { store } = ctx;
  const problems: string[] = [];

  if (Object.keys(plan.settings).length > 0) await updateSettings(store, plan.settings, actor);

  // Meeting kinds someone made, by name.
  const slugOf = new Map<string, string>();
  for (const c of plan.categories) {
    const snap = await store.refresh();
    const found = snap.config.categories.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    if (found) slugOf.set(c.oldSlug, found.slug);
    else {
      const color = (CATEGORY_PALETTE as readonly string[]).includes(c.color)
        ? c.color
        : CATEGORY_PALETTE[0];
      const made = await createCategory(store, { name: c.name, color }, actor);
      slugOf.set(c.oldSlug, made.slug);
      console.log(`Made meeting kind ${made.name}`);
    }
  }

  // Column changes the owner made in the old database (a column made optional, renamed, or shown in the table).
  {
    const snap = await store.refresh();
    for (const old of plan.oldFields) {
      const slug = slugOf.get(old.category_slug) ?? old.category_slug;
      const now = snap.config.byCategory.get(slug)?.fields.find((f) => f.key === old.key);
      if (!now) continue;
      const patch: Record<string, unknown> = {};
      if (old.label !== now.label) patch.label = old.label;
      if (old.show_in_table !== now.show_in_table) patch.show_in_table = old.show_in_table;
      if (!now.locked) {
        if (old.required !== now.required) patch.required = old.required;
        if (old.show_in_form !== now.show_in_form) patch.show_in_form = old.show_in_form;
      }
      if (Object.keys(patch).length === 0) continue;
      try {
        await updateField(store, slug, old.key, patch, actor);
        console.log(`Column ${slug}.${old.key}: ${JSON.stringify(patch)}`);
      } catch (err) {
        problems.push(
          `Column ${slug}.${old.key}: ${err instanceof ValidationFailed ? JSON.stringify(err.issues) : String(err)}`,
        );
      }
    }
  }

  // Meetings, with their ids.
  let meetingsDone = 0;
  for (const m of plan.meetings) {
    const category = slugOf.get(m.category) ?? m.category;
    try {
      const r = await ctx.meetings.create({ id: m.id, category, values: m.values }, actor);
      meetingsDone += r.existing ? 0 : 1;
    } catch (err) {
      problems.push(
        `Meeting "${m.title}": ${err instanceof ValidationFailed ? JSON.stringify(err.issues) : String(err)}`,
      );
    }
    await sleep(pause);
  }
  await ctx.calendar.settle(20000);
  console.log(`Meetings copied: ${meetingsDone} (of ${plan.meetings.length})`);

  // Lists.
  for (const l of plan.lists) {
    let slug = l.existingSlug;
    if (!slug) {
      const snap = await store.refresh();
      const found = snap.config.trackers.find(
        (t) => t.name.toLowerCase() === (l.name ?? '').toLowerCase(),
      );
      slug =
        found?.slug ??
        (
          await createTracker(
            store,
            {
              name: l.name as string,
              item_name: l.itemName ?? 'item',
              color: l.color ?? CATEGORY_PALETTE[0],
            },
            actor,
          )
        ).slug;
    }
    const keyOf = new Map<string, string>();
    for (const [key, change] of Object.entries(l.starting ?? {})) {
      await updateField(store, slug, key, change, actor);
    }
    for (const f of l.fields ?? []) {
      const snap = await store.refresh();
      const existing = snap.config.byTracker.get(slug)?.fields.find((x) => x.label === f.label);
      const made =
        existing ??
        (await addField(
          store,
          slug,
          {
            label: f.label,
            type: f.type,
            options: f.options,
            allow_new_options: f.allow_new_options,
            unit: f.unit,
            help_text: f.help_text,
            show_in_table: f.show_in_table,
          },
          actor,
        ));
      keyOf.set(f.key, made.key);
    }
    if (l.roles) {
      const roles = { ...l.roles };
      for (const k of ['title_key', 'status_key', 'due_key', 'group_key'] as const)
        if (roles[k]) roles[k] = keyOf.get(roles[k] as string) ?? roles[k];
      if (roles.sum_keys) roles.sum_keys = roles.sum_keys.map((k) => keyOf.get(k) ?? k);
      await updateTracker(store, slug, { roles, calendar: false }, actor);
    }

    let done = 0;
    const seen = new Map<string, Map<string, number>>();
    for (const row of l.rows) {
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row.values)) {
        const key = keyOf.get(k) ?? k;
        values[key] = v;
        if (typeof v === 'string' && v) {
          const m = seen.get(key) ?? new Map<string, number>();
          m.set(v, (m.get(v) ?? 0) + 1);
          seen.set(key, m);
        }
      }
      try {
        const r = await ctx.trackers.create(slug, { id: row.id, values, copying: true }, actor);
        done += r.existing ? 0 : 1;
      } catch (err) {
        problems.push(
          `${slug} row "${String(values.name ?? values.project ?? row.id)}": ${err instanceof ValidationFailed ? JSON.stringify(err.issues) : String(err)}`,
        );
      }
      await sleep(pause);
    }
    // Teach each learning dropdown its values once, most used first.
    const snap = await store.refresh();
    for (const f of snap.config.byTracker.get(slug)?.fields ?? []) {
      if (f.type !== 'select' || !f.allow_new_options) continue;
      const counts = seen.get(f.key);
      if (!counts) continue;
      const learned = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
      const options = [
        ...f.options,
        ...learned.filter((v) => !f.options.some((o) => o.toLowerCase() === v.toLowerCase())),
      ];
      if (options.length !== f.options.length)
        await updateField(store, slug, f.key, { options }, actor);
    }
    console.log(`List ${slug}: ${done} rows copied (of ${l.rows.length})`);
  }
  await ctx.trackers.settle(20000);

  return problems;
}
