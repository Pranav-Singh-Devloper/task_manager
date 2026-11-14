import { instantOf, nowIn, todayIn } from '../../shared/dates';
import { evaluateFormula, type Value } from '../../shared/formula';
import type { Meeting } from '../../shared/meeting';
import { renderTitle } from '../../shared/titles';
import type { FieldValue } from '../../shared/types';
import { missingRequired } from '../../shared/validation';
import type { Entry, Snapshot } from './store';
import type { SheetStore } from './store';

const asValue = (v: FieldValue | undefined): Value =>
  Array.isArray(v) ? v.join(', ') : (v ?? null);

/** The title shown everywhere: the topic if there is one, otherwise the category's template (§9 rule 7). */
export function titleOf(snap: Snapshot, slug: string, values: Record<string, FieldValue>): string {
  const cat = snap.config.byCategory.get(slug)?.category;
  const topic = typeof values.topic === 'string' ? values.topic.trim() : '';
  if (topic) return topic;
  const fromTemplate = cat?.title_template ? renderTitle(cat.title_template, values) : '';
  return fromTemplate || cat?.name || '';
}

/** Builds the API shape of a meeting: its values, calculated columns, title and any "needs attention" notes. */
export function toMeeting(store: SheetStore, snap: Snapshot, slug: string, entry: Entry): Meeting {
  const cfg = snap.config.byCategory.get(slug);
  const { values, system, problems } = entry.record;
  const tz = snap.config.settings.timezone;
  const now = store.now();

  const computed: Record<string, Value> = {};
  for (const f of cfg?.fields ?? []) {
    if (f.type !== 'computed' || f.archived) continue;
    computed[f.key] = evaluateFormula(f.computed_expr, {
      get: (key) => asValue(values[key]),
      today: () => todayIn(tz, now),
      now: () => nowIn(tz, now),
      countSame: (key) => store.countSame(slug, key, values[key]),
    });
  }

  return {
    id: system.id,
    category_slug: slug,
    rev: system.rev,
    title: titleOf(snap, slug, values),
    values,
    computed,
    created_at: system.created_at,
    updated_at: system.updated_at,
    created_by: system.created_by,
    deleted_at: system.deleted_at || null,
    calendar_event_id: system.calendar_event_id,
    calendar_sync: system.calendar_sync,
    previous_id: system.previous_id,
    series_id: system.series_id,
    needs_attention: problems,
    incomplete: missingRequired(cfg?.fields ?? [], values, Boolean(cfg?.category.title_template)),
  };
}

/** The moment a meeting starts, or null if its date or time is missing. */
export function startOf(values: Record<string, FieldValue>, tz: string): Date | null {
  return typeof values.date === 'string' && typeof values.start_time === 'string'
    ? instantOf(values.date, values.start_time, tz)
    : null;
}
