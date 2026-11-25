'use client';

import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { FieldControl } from '@/components/meeting/field-control';
import { valueText } from '@/components/meeting/format';
import { PageTitle } from '@/components/motion';
import { Button, Chip, FormField, Input, buttonClasses, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta, useTrackerRows, type Meta, type TrackerData } from '@/lib/queries';
import { shiftDate, todayIn } from '@/shared/dates';
import { currentStage, parseStages } from '@/shared/stages';
import {
  PRESETS,
  matchesPreset,
  matchesSearch,
  trackerKpis,
  isClosed,
  rowName,
  type Breakdown,
  type Preset,
  type TrackerRow,
} from '@/shared/trackerKpis';
import type { FieldDef, TrackerDef } from '@/shared/types';
import { NOT_EDITABLE } from '@/shared/validation';
import { KpiTiles, num } from './kpi-tiles';

/** /trackers/[slug]: the tracker's numbers, a breakdown, and its rows, all on one screen where it fits. */
export function TrackerScreen({ slug }: { slug: string }) {
  const t = useTranslations('trackers');
  const meta = useMeta();
  const rows = useTrackerRows(slug);
  if (meta.isPending || rows.isPending) return <p>{t('loading')}</p>;
  if (rows.isError || !rows.data || !meta.data) {
    return (
      <p className="font-semibold">
        {rows.error instanceof ApiError && rows.error.status === 404
          ? t('notFound')
          : t('loadFailed')}
      </p>
    );
  }
  return <Loaded data={rows.data} meta={meta.data} />;
}

interface Filters {
  show: Preset;
  days?: number;
  group?: string;
  field?: string;
  value?: string;
  state?: string;
  q: string;
}

function readFilters(params: URLSearchParams): Filters {
  const show = params.get('show') ?? '';
  const days = Number(params.get('days'));
  return {
    show: (PRESETS as readonly string[]).includes(show) ? (show as Preset) : 'all',
    days: Number.isFinite(days) && days > 0 && days <= 366 ? days : undefined,
    group: params.get('group') ?? undefined,
    field: params.get('field') ?? undefined,
    value: params.get('value') ?? undefined,
    state: params.get('state') ?? undefined,
    q: params.get('q') ?? '',
  };
}

const text = (v: unknown) =>
  v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);

function nowAt(row: TrackerRow, key: string): string | null {
  const v = row.values[key];
  const cur = Array.isArray(v) ? currentStage(parseStages(v.map(String))) : null;
  return cur ? cur.stage.name : null;
}

function Loaded({ data, meta }: { data: TrackerData; meta: Meta }) {
  const t = useTranslations('trackers');
  const common = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const { tracker, fields } = data;
  const roles = tracker.settings.roles;
  const today = todayIn(meta.settings.timezone);
  const kpis = useMemo(
    () => trackerKpis(tracker, fields, data.rows, today),
    [tracker, fields, data.rows, today],
  );
  const words = { yes: common('yes'), no: common('no') };

  const setParams = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // ---- order: the owner's own ("Arrange"), else unfinished first and then the date that matters ----
  const client = useQueryClient();
  const toast = useToast();
  const [arranging, setArranging] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const order = localOrder ?? tracker.settings.order ?? [];
  const byDate = (a: TrackerRow, b: TrackerRow) => {
    const ca = isClosed(a, roles) ? 1 : 0;
    const cb = isClosed(b, roles) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const da = text(a.values[roles.due_key]) || '9999';
    const db = text(b.values[roles.due_key]) || '9999';
    if (da !== db) return da < db ? -1 : 1;
    return (Number(a.values.sr_no) || 0) - (Number(b.values.sr_no) || 0);
  };
  const position = new Map(order.map((id, i) => [id, i]));
  const arranged = (a: TrackerRow, b: TrackerRow) => {
    const ia = position.get(a.id);
    const ib = position.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return byDate(a, b);
  };

  // Several moves in a row are saved once, so Google's write limit is not reached. "Done arranging" and leaving the
  // page save at once.
  const unsaved = useRef<string[] | null>(null);
  async function sendOrder(next: string[]) {
    try {
      await api(`/trackers/${tracker.slug}/order`, { method: 'PATCH', body: { order: next } });
      await client.invalidateQueries({ queryKey: ['tracker', tracker.slug] });
      await client.invalidateQueries({ queryKey: ['meta'] });
      setLocalOrder((cur) => (cur === next ? null : cur));
    } catch (e) {
      setLocalOrder(null);
      toast.show({ message: e instanceof ApiError ? e.message : t('orderFailed') });
    }
  }
  function flushOrder() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const next = unsaved.current;
    unsaved.current = null;
    if (next) void sendOrder(next);
  }
  function saveOrder(next: string[], now = false) {
    setLocalOrder(next);
    unsaved.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushOrder, now ? 0 : 900);
  }
  const slugRef = useRef(tracker.slug);
  useEffect(() => {
    // Leaving the page (or the app) with a move not yet saved: send it on the way out.
    const leave = () => {
      const next = unsaved.current;
      if (!next) return;
      unsaved.current = null;
      void fetch(`/api/trackers/${slugRef.current}/order`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mm' },
        body: JSON.stringify({ order: next }),
      });
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      leave();
    };
  }, []);

  function move(id: string, target: string, after: boolean) {
    const all = [...data.rows].sort(arranged).map((r) => r.id);
    const rest = all.filter((x) => x !== id);
    const at = rest.indexOf(target);
    if (at < 0) return;
    rest.splice(after ? at + 1 : at, 0, id);
    saveOrder(rest);
  }

  const shown = data.rows
    .filter((r) => matchesPreset(r, filters.show, { roles, today, days: filters.days }))
    .filter((r) => !filters.group || text(r.values[roles.group_key]) === filters.group)
    .filter((r) => !filters.field || text(r.values[filters.field]) === (filters.value ?? ''))
    .filter(
      (r) => filters.state === undefined || (nowAt(r, roles.stages_key) ?? '') === filters.state,
    )
    .filter((r) => matchesSearch(r, fields, filters.q))
    .sort(arranged);

  const active: string[] = [];
  if (filters.show !== 'all')
    active.push(t(`preset_${filters.show}` as 'preset_due', { days: filters.days ?? 7 }));
  if (filters.group)
    active.push(
      t('filterValue', {
        column: fields.find((f) => f.key === roles.group_key)?.label ?? '',
        value: filters.group,
      }),
    );
  if (filters.field)
    active.push(
      t('filterValue', {
        column: fields.find((f) => f.key === filters.field)?.label ?? filters.field,
        value: filters.value ?? '',
      }),
    );
  if (filters.state !== undefined)
    active.push(t('filterState', { value: filters.state || t('notStarted') }));

  // The name comes first, so it is not repeated as a column. With a short name, the full name is seen only on a
  // row's own page.
  const columns = fields.filter(
    (f) =>
      f.show_in_table &&
      !f.archived &&
      f.key !== roles.title_key &&
      f.key !== roles.short_key &&
      f.key !== 'sr_no',
  );

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{tracker.name}</PageTitle>
        <Link href={`/trackers/${tracker.slug}/new`} className={buttonClasses('primary')}>
          {t('add', { item: tracker.item_name })}
        </Link>
      </div>

      <KpiTiles slug={tracker.slug} kpis={kpis} />
      {tracker.kind === 'award' && <AwardTarget tracker={tracker} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section aria-labelledby="list-heading" className="flex min-w-0 flex-col gap-3">
          <h2 id="list-heading" className="sr-only">
            {t('listCaption', { name: tracker.name })}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <FormField name="q" label={t('searchLabel', { name: tracker.name })}>
                {(c) => (
                  <Input
                    id={c.id}
                    type="search"
                    defaultValue={filters.q}
                    placeholder={t('searchPlaceholder')}
                    onChange={(e) => setParams({ q: e.target.value })}
                  />
                )}
              </FormField>
            </div>
          </div>
          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="status">
              <span className="font-semibold">{t('showingLabel')}</span>
              {active.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
              <Button
                onClick={() =>
                  setParams({
                    show: null,
                    days: null,
                    group: null,
                    field: null,
                    value: null,
                    state: null,
                  })
                }
              >
                {t('showAll')}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted">
              {t('count', { shown: shown.length, total: data.rows.length })}
            </p>
            {data.rows.length > 1 && (
              <Button
                aria-pressed={arranging}
                onClick={() => {
                  if (arranging) flushOrder();
                  setArranging((a) => !a);
                }}
                variant={arranging ? 'primary' : 'outline'}
              >
                {arranging ? t('arrangeDone') : t('arrange')}
              </Button>
            )}
            {order.length > 0 && (
              <Button onClick={() => saveOrder([], true)}>
                {roles.due_key
                  ? t('sortByDate', {
                      column: fields.find((f) => f.key === roles.due_key)?.label ?? '',
                    })
                  : t('sortUsual')}
              </Button>
            )}
          </div>
          {arranging && <p role="status">{t('arrangeHint')}</p>}
          {shown.length === 0 ? (
            <p className="rounded-2xl border-ui border-soft bg-surface p-4">
              {data.rows.length === 0 ? t('empty') : t('emptyFiltered')}
            </p>
          ) : (
            <RowList
              tracker={tracker}
              fields={fields}
              columns={columns}
              rows={shown}
              meta={meta}
              words={words}
              arranging={arranging}
              onMove={move}
            />
          )}
        </section>

        <aside className="flex flex-col gap-4">
          {kpis.breakdowns.map((b) => (
            <BreakdownCard key={b.id} slug={tracker.slug} breakdown={b} fields={fields} />
          ))}
        </aside>
      </div>
    </div>
  );
}

type Layout = 'card' | 'table';

const STICKY_RIGHT = 'sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]';

function RowList({
  tracker,
  fields,
  columns,
  rows,
  meta,
  words,
  arranging,
  onMove,
}: {
  tracker: TrackerDef;
  fields: FieldDef[];
  columns: FieldDef[];
  rows: TrackerRow[];
  meta: Meta;
  words: { yes: string; no: string };
  arranging: boolean;
  onMove: (id: string, target: string, after: boolean) => void;
}) {
  const t = useTranslations('trackers');
  const roles = tracker.settings.roles;
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const titleOf = (r: TrackerRow) => rowName(r.values, roles) || t('untitled');
  const cell = (f: FieldDef, r: TrackerRow) =>
    valueText(f, r.values[f.key] ?? null, meta.settings, words) ?? '—';
  const href = (r: TrackerRow) => `/trackers/${tracker.slug}/${r.id}`;
  const titleLabel =
    fields.find((f) => f.key === (roles.short_key || roles.title_key))?.label ?? '';
  // A long name is cut to two lines here; the whole of it is on the row's page.
  const name = (r: TrackerRow) => <span className="line-clamp-2">{titleOf(r)}</span>;
  // Quick changes cover the columns shown in the list (the BDD and Remarks, say); the rest is on the row's page.
  const quick = columns.filter((f) => f.show_in_form && !NOT_EDITABLE.has(f.type));
  const span = columns.length + (arranging ? 3 : 2);

  // Up and down move past the row next to it on screen, so arranging works while a search is shown too.
  const step = (r: TrackerRow, i: number, dir: -1 | 1, at: Layout) => {
    const other = rows[i + dir];
    if (!other) return;
    onMove(r.id, other.id, dir === 1);
    // The row moves; the focus follows it.
    requestAnimationFrame(() =>
      document.getElementById(`${at}-move-${dir === 1 ? 'down' : 'up'}-${r.id}`)?.focus(),
    );
  };
  const moveButtons = (r: TrackerRow, i: number, at: Layout) => (
    <div className="flex gap-2">
      <Button
        id={`${at}-move-up-${r.id}`}
        aria-label={t('moveUp', { name: titleOf(r) })}
        disabled={i === 0}
        onClick={() => step(r, i, -1, at)}
      >
        <span aria-hidden="true">{'↑'}</span>
      </Button>
      <Button
        id={`${at}-move-down-${r.id}`}
        aria-label={t('moveDown', { name: titleOf(r) })}
        disabled={i === rows.length - 1}
        onClick={() => step(r, i, 1, at)}
      >
        <span aria-hidden="true">{'↓'}</span>
      </Button>
    </div>
  );
  // Phone cards and the table are both in the page (one hidden), so each keeps its own open form and ids.
  const editButton = (r: TrackerRow, at: Layout) =>
    quick.length > 0 && (
      <Button
        aria-expanded={editing === `${at}:${r.id}`}
        aria-label={t('editRow', { name: titleOf(r) })}
        onClick={() => setEditing((cur) => (cur === `${at}:${r.id}` ? null : `${at}:${r.id}`))}
      >
        {t('edit')}
      </Button>
    );
  const drop = (e: DragEvent, target: TrackerRow, i: number) => {
    e.preventDefault();
    const from = rows.findIndex((x) => x.id === dragging);
    if (dragging && dragging !== target.id && from >= 0) onMove(dragging, target.id, from < i);
    setDragging(null);
  };

  return (
    <>
      {/* Cards on a phone. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r, i) => (
          <li key={r.id} className="rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm">
            <Link
              href={href(r)}
              className="flex min-h-tap items-center text-lg font-semibold underline"
            >
              {name(r)}
            </Link>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {columns.map((f) => (
                <div key={f.key} className="contents">
                  <dt className="font-semibold">{f.label}</dt>
                  <dd className={clsx('break-words', f.type === 'long_text' && 'line-clamp-3')}>
                    {cell(f, r)}
                  </dd>
                </div>
              ))}
            </dl>
            {r.incomplete.length > 0 && <Chip className="mt-2">{t('incomplete')}</Chip>}
            <div className="mt-3 flex flex-wrap gap-2">
              {arranging && moveButtons(r, i, 'card')}
              {editButton(r, 'card')}
            </div>
            {editing === `card:${r.id}` && (
              <QuickEdit
                tracker={tracker}
                fields={quick}
                row={r}
                meta={meta}
                name={titleOf(r)}
                onDone={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>
      {/* A table from tablet width up. */}
      <div className="relative hidden overflow-x-auto rounded-2xl border-ui border-soft bg-surface shadow-sm md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t('listCaption', { name: tracker.name })}</caption>
          <thead>
            <tr className="border-b-ui border-line bg-sunken">
              {arranging && (
                <th scope="col" className="px-4 py-2 font-semibold">
                  {t('orderColumn')}
                </th>
              )}
              <th scope="col" className="px-4 py-2 font-semibold">
                {titleLabel}
              </th>
              {columns.map((f) => (
                <th key={f.key} scope="col" className="px-4 py-2 font-semibold">
                  {f.label}
                </th>
              ))}
              {/* Edit stays in view at the right edge when a wide table scrolls sideways. */}
              <th scope="col" className={clsx('px-4 py-2 bg-sunken', STICKY_RIGHT)}>
                <span className="sr-only">{t('edit')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => [
              <tr
                key={r.id}
                draggable={arranging}
                onDragStart={(e) => {
                  setDragging(r.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => drop(e, r, i)}
                className={clsx(
                  'border-t-ui border-soft align-middle',
                  arranging && 'cursor-grab',
                  dragging === r.id && 'opacity-50',
                )}
              >
                {arranging && (
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-xl text-muted">
                        {'⠿'}
                      </span>
                      {moveButtons(r, i, 'table')}
                    </div>
                  </td>
                )}
                <td className="min-w-[16rem] max-w-[26rem] px-4 py-2">
                  <Link
                    href={href(r)}
                    className="flex min-h-tap items-center font-semibold underline"
                  >
                    {name(r)}
                  </Link>
                  {r.incomplete.length > 0 && <Chip className="ml-2">{t('incomplete')}</Chip>}
                </td>
                {columns.map((f) => (
                  // Short values stay on one line so every row is the same height; long text may wrap.
                  <td
                    key={f.key}
                    className={clsx(
                      'px-4 py-2',
                      f.type !== 'long_text' && f.type !== 'text' && 'whitespace-nowrap',
                      f.type === 'long_text' && 'min-w-[14rem]',
                    )}
                  >
                    {/* Long notes are cut to three lines here; the whole of them is on the row's page. */}
                    {f.type === 'long_text' ? (
                      <span className="line-clamp-3">{cell(f, r)}</span>
                    ) : (
                      cell(f, r)
                    )}
                  </td>
                ))}
                <td className={clsx('bg-surface px-4 py-2', STICKY_RIGHT)}>
                  {editButton(r, 'table')}
                </td>
              </tr>,
              editing === `table:${r.id}` && (
                <tr key={`${r.id}-edit`} className="bg-sunken">
                  <td colSpan={span} className="px-4 py-3">
                    <QuickEdit
                      tracker={tracker}
                      fields={quick}
                      row={r}
                      meta={meta}
                      name={titleOf(r)}
                      onDone={() => setEditing(null)}
                    />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Changes the columns shown in the list right there, without leaving the list. */
function QuickEdit({
  tracker,
  fields,
  row,
  meta,
  name,
  onDone,
}: {
  tracker: TrackerDef;
  fields: FieldDef[];
  row: TrackerRow;
  meta: Meta;
  name: string;
  onDone: () => void;
}) {
  const t = useTranslations('trackers');
  const common = useTranslations('common');
  const client = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...row.values }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const today = todayIn(meta.settings.timezone);

  async function save() {
    setSaving(true);
    setErrors({});
    setFailure('');
    const body: Record<string, unknown> = {};
    for (const f of fields) body[f.key] = values[f.key] ?? null;
    try {
      await api(`/trackers/${tracker.slug}/rows/${row.id}`, {
        method: 'PATCH',
        body: { rev: row.rev, values: body },
      });
      await client.invalidateQueries();
      toast.show({ message: t('savedName', { name }) });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
        setFailure(t('fixErrors'));
      } else setFailure(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      aria-label={t('editRow', { name })}
      className="mt-3 flex flex-col gap-3 md:mt-0"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.type === 'long_text' ? 'lg:col-span-2' : undefined}>
            <FieldControl
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
              error={errors[f.key]}
              quickDates={f.type === 'date' ? { today, tomorrow: shiftDate(today, 1) } : undefined}
            />
          </div>
        ))}
      </div>
      {failure && (
        <p role="alert" className="font-semibold text-danger">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <Button onClick={onDone}>{common('cancel')}</Button>
      </div>
    </form>
  );
}

function BreakdownCard({
  slug,
  breakdown,
  fields,
}: {
  slug: string;
  breakdown: Breakdown;
  fields: FieldDef[];
}) {
  const t = useTranslations('trackers');
  const max = Math.max(1, ...breakdown.items.map((i) => i.count));
  const unit = fields.find((f) => f.key === breakdown.sumKey)?.unit ?? '';
  const hrefFor = (label: string) => {
    const q = new URLSearchParams();
    if (breakdown.id === 'byState') q.set('state', label);
    else {
      q.set('field', breakdown.key);
      q.set('value', label);
    }
    if (breakdown.id === 'lateByGroup') q.set('show', 'overdue');
    else if (breakdown.id !== 'byStatus') q.set('show', 'open');
    return `/trackers/${slug}?${q.toString()}`;
  };
  const headingId = `breakdown-${breakdown.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm"
    >
      <h2 id={headingId} className="mb-2 font-display text-xl font-semibold">
        {t(`breakdown_${breakdown.id}` as 'breakdown_byGroup', { column: breakdown.label })}
      </h2>
      {breakdown.items.length === 0 ? (
        <p className="text-muted">{t('breakdownEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {breakdown.items.map((item) => (
            <li key={item.label}>
              <Link
                href={hrefFor(item.label)}
                className="flex min-h-tap flex-col justify-center rounded-lg px-2 hover:bg-sunken"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{item.label || t('notStarted')}</span>
                  <span className="shrink-0">
                    {item.count}
                    {item.sum ? ` · ${t('breakdownSum', { sum: num(item.sum), unit })}` : ''}
                  </span>
                </span>
                <span aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-sunken">
                  <span
                    className={clsx('block h-full rounded-full bg-accent')}
                    style={{ width: `${(item.count / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Award Plan: this year's target in km and ₹ Cr, shown under the tiles and changed in place. */
function AwardTarget({ tracker }: { tracker: TrackerDef }) {
  const t = useTranslations('trackers');
  const client = useQueryClient();
  const { km, cr } = tracker.settings.targets;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ km: km ? String(km) : '', cr: cr ? String(cr) : '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save() {
    setError('');
    try {
      await api(`/trackers/${tracker.slug}/targets`, {
        method: 'PATCH',
        body: { km: draft.km || null, cr: draft.cr || null },
      });
      await client.invalidateQueries();
      setEditing(false);
      setMessage(t('targetSaved'));
    } catch (e) {
      setError(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('saveFailed'));
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold">
          {km || cr ? t('target', { km: num(km ?? 0), cr: num(cr ?? 0) }) : t('targetNone')}
        </p>
        <Button onClick={() => setEditing(true)}>
          {km || cr ? t('targetChange') : t('targetSet')}
        </Button>
        <p role="status" className="text-muted">
          {message}
        </p>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3 rounded-2xl border-ui border-soft bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <FormField name="target-km" label={t('targetKm')}>
        {(c) => (
          <Input
            id={c.id}
            inputMode="decimal"
            value={draft.km}
            onChange={(e) => setDraft({ ...draft, km: e.target.value })}
            className="w-40"
          />
        )}
      </FormField>
      <FormField name="target-cr" label={t('targetCr')} error={error || undefined}>
        {(c) => (
          <Input
            id={c.id}
            inputMode="decimal"
            value={draft.cr}
            onChange={(e) => setDraft({ ...draft, cr: e.target.value })}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            className="w-40"
          />
        )}
      </FormField>
      <Button type="submit" variant="primary">
        {t('targetSave')}
      </Button>
    </form>
  );
}
