'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { GlowCard } from '@/components/motion';
import { Button, buttonClasses, CardTitle, Chip, Segmented, useToast } from '@/components/ui';
import { dateText, timeText } from '@/components/meeting/format';
import { api } from '@/lib/api';
import { isFiltered, toApiQuery, type Tab, type View } from '@/lib/dashboard-params';
import { useMeta, type Meta } from '@/lib/queries';
import { useIsMobile, usePersistentChoice, usePersistentJson } from '@/lib/use-choice';
import type { Meeting } from '@/shared/meeting';
import { buildColumns, isVisible, orderKey, type Chosen, type Col } from './columns';
import { Controls } from './controls';
import { ActiveFilters, FilterBuilder } from './filter-builder';
import { MeetingCards } from './meeting-cards';
import { MeetingTable } from './meeting-table';
import { CategoryChip, StatusCell, isWebLink } from './row-bits';
import { useDashboard } from './use-dashboard';
import { Welcome } from './welcome';

// The calendar is large and only needed when it is chosen, so it loads then.
function CalendarLoading() {
  const t = useTranslations('dashboard');
  return <p>{t('calLoading')}</p>;
}

const CalendarView = dynamic(() => import('./calendar-view'), {
  ssr: false,
  loading: () => <CalendarLoading />,
});

interface Page {
  meetings: Meeting[];
  total: number;
  next_cursor: string | null;
}
interface Summary {
  next: Meeting | null;
  incomplete: number;
  waiting: number;
  unsynced: number;
}

const PAGE = 50;

/** /: everything about what is coming up, in one place (§7.2). */
export function DashboardScreen() {
  const t = useTranslations('dashboard');
  const meta = useMeta();
  if (meta.isPending) return <p>{t('loading')}</p>;
  if (meta.isError || !meta.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-semibold">{t('loadFailed')}</p>
        <Button variant="primary" onClick={() => void meta.refetch()}>
          {t('show')}
        </Button>
      </div>
    );
  }
  return <Dashboard meta={meta.data} />;
}

function Dashboard({ meta }: { meta: Meta }) {
  const t = useTranslations('dashboard');
  const nav = useTranslations('nav');
  const common = useTranslations('common');
  const { params, update, clear, here } = useDashboard();
  const mobile = useIsMobile();
  const [tab, setTab] = usePersistentChoice<Tab>('mm.dash.tab', 'upcoming', ['upcoming', 'past']);
  const [view, setView] = usePersistentChoice<View>('mm.dash.view', 'table', ['table', 'calendar']);
  const [chosen, setChosen] = usePersistentJson<Record<string, Chosen>>('mm.columns', {});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const { settings } = meta;
  const client = useQueryClient();
  const toast = useToast();
  const [fixing, setFixing] = useState(false);

  /** "Fix now": try the calendar again for every meeting that is not on it. */
  async function fixCalendar() {
    setFixing(true);
    try {
      const r = await api<{ failed: number }>('/calendar/retry-all', { method: 'POST' });
      await client.invalidateQueries();
      toast.show({ message: r.failed === 0 ? t('fixedCalendar') : t('stillNotOnCalendar') });
    } catch {
      toast.show({ message: t('stillNotOnCalendar') });
    } finally {
      setFixing(false);
    }
  }

  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<Summary>('/meetings/summary'),
  });

  const baseQuery = toApiQuery(params, settings, { scope: tab, limit: PAGE });
  const list = useInfiniteQuery({
    queryKey: ['meetings', baseQuery],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<Page>(
        `/meetings?${toApiQuery(params, settings, { scope: tab, limit: PAGE, cursor: pageParam || undefined })}`,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: view === 'table',
  });
  const meetings = useMemo(() => list.data?.pages.flatMap((p) => p.meetings) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  // ---- sorting ----
  const defaultDir = tab === 'past' ? 'desc' : 'asc';
  const sort = params.sort || 'date';
  const dir = params.dir || defaultDir;
  const grouped = sort === 'date';
  const columnKey = params.category || '*';
  const all = useMemo(
    () =>
      buildColumns(meta, params.category, {
        time: t('colTime'),
        category: t('colCategory'),
        meeting: t('colMeeting'),
        status: t('colStatus'),
        join: t('colJoin'),
        files: t('colFiles'),
        actions: t('colActions'),
      }),
    [meta, params.category, t],
  );
  const shown = all.filter((c) => isVisible(c, chosen[columnKey]));
  const sortedCol = all.find((c) => c.sortKey === sort);
  const onSort = (col: Col) => {
    if (!col.sortKey) return;
    if (col.sortKey === sort) update({ dir: dir === 'asc' ? 'desc' : 'asc' });
    else
      update({
        sort: col.sortKey === 'date' ? '' : col.sortKey,
        dir: col.sortKey === 'date' ? '' : 'asc',
      });
  };
  const toggleColumn = (col: Col, on: boolean) => {
    const cur = chosen[columnKey] ?? { on: [], off: [] };
    setChosen({
      ...chosen,
      [columnKey]: {
        on: on
          ? [...cur.on.filter((x) => x !== col.id), col.id]
          : cur.on.filter((x) => x !== col.id),
        off: on
          ? cur.off.filter((x) => x !== col.id)
          : [...cur.off.filter((x) => x !== col.id), col.id],
      },
    });
  };

  const attention = params.attention;
  const next = summary.data?.next ?? null;
  const filtered = isFiltered(params);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <Welcome settings={settings} />

      <GlowCard>
        <CardTitle>{t('nextTitle')}</CardTitle>
        {summary.isPending ? (
          <p>{t('loading')}</p>
        ) : next ? (
          <div className="flex flex-col gap-3">
            <p className="font-display text-3xl font-semibold text-accent">
              {typeof next.values.date === 'string' ? dateText(next.values.date, settings) : ''} ·{' '}
              {typeof next.values.start_time === 'string'
                ? timeText(next.values.start_time, settings)
                : ''}
            </p>
            <p className="text-xl font-semibold">{next.title}</p>
            <div className="flex flex-wrap gap-2">
              <CategoryChip meeting={next} meta={meta} />
              <StatusCell meeting={next} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/meetings/${next.id}`} className={buttonClasses('primary')}>
                {t('open')}
              </Link>
              {isWebLink(next.values.meeting_link) && (
                <a
                  href={next.values.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClasses('outline')}
                >
                  {t('join')}
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p>{t('noUpcoming')}</p>
            <Link href="/meetings/new" className={buttonClasses('primary')}>
              {nav('newMeeting')}
            </Link>
          </div>
        )}
      </GlowCard>

      {/* One plain sentence for each thing that needs a look, each with a button (§7.2). */}
      {!attention &&
        summary.data &&
        (summary.data.incomplete > 0 || summary.data.waiting > 0 || summary.data.unsynced > 0) && (
          <div role="status" className="flex flex-col gap-2">
            {summary.data.incomplete > 0 && (
              <p className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface p-3 pl-5 shadow-sm">
                <span className="font-semibold">
                  {t('attentionIncomplete', { count: summary.data.incomplete })}
                </span>
                <Button onClick={() => update({ attention: 'incomplete' })}>{t('show')}</Button>
              </p>
            )}
            {summary.data.unsynced > 0 && (
              <p className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface p-3 pl-5 shadow-sm">
                <span className="font-semibold">
                  {t('attentionUnsynced', { count: summary.data.unsynced })}
                </span>
                <Button disabled={fixing} onClick={() => void fixCalendar()}>
                  {t('fixNow')}
                </Button>
              </p>
            )}
            {summary.data.waiting > 0 && (
              <p className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface p-3 pl-5 shadow-sm">
                <span className="font-semibold">
                  {t('attentionWaiting', { count: summary.data.waiting })}
                </span>
                <Button onClick={() => update({ attention: 'awaiting' })}>{t('show')}</Button>
              </p>
            )}
          </div>
        )}
      {attention && (
        <p className="flex flex-wrap items-center gap-3">
          <Chip>{attention === 'incomplete' ? t('showingIncomplete') : t('showingAwaiting')}</Chip>
          <Button onClick={() => update({ attention: '' })}>{t('showAll')}</Button>
        </p>
      )}

      <Controls meta={meta} params={params} update={update} />

      <div className="flex flex-wrap items-center gap-3">
        <Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          {filtersOpen ? t('hideFilters') : t('moreFilters')}
        </Button>
        {view === 'table' && !attention && (
          <Segmented
            label={t('tabsLabel')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upcoming', label: t('upcoming') },
              { value: 'past', label: t('past') },
            ]}
          />
        )}
        <Segmented
          label={t('viewsLabel')}
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: t('table') },
            { value: 'calendar', label: t('calendar') },
          ]}
        />
      </div>

      {filtersOpen && (
        <FilterBuilder
          meta={meta}
          category={params.category}
          onAdd={(spec) => update({ filters: [...params.filters, spec] })}
        />
      )}
      <ActiveFilters
        filters={params.filters}
        meta={meta}
        onRemove={(i) => update({ filters: params.filters.filter((_, n) => n !== i) })}
        onClearAll={clear}
      />
      {filtered &&
        params.filters.length === 0 &&
        !(view === 'table' && list.isSuccess && meetings.length === 0) && (
          <div>
            <Button onClick={clear}>{t('clearAll')}</Button>
          </div>
        )}

      {view === 'calendar' ? (
        <CalendarView meta={meta} params={params} mobile={mobile} here={here} />
      ) : (
        <section className="flex flex-col gap-4" aria-busy={list.isFetching}>
          {all.length > 6 && !mobile && (
            <div className="flex flex-col items-start gap-3">
              <Button aria-expanded={columnsOpen} onClick={() => setColumnsOpen((o) => !o)}>
                {columnsOpen ? t('hideColumns') : t('chooseColumns')}
              </Button>
              {columnsOpen && (
                <fieldset className="flex flex-col gap-2 rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm">
                  <legend className="px-2 font-semibold">{t('chooseColumns')}</legend>
                  <p className="text-muted">{t('columnsHint')}</p>
                  {all
                    .filter((c) => !c.fixed)
                    .map((c) => (
                      <label key={c.id} className="flex min-h-tap items-center gap-3 font-semibold">
                        <input
                          type="checkbox"
                          className="h-6 w-6"
                          checked={isVisible(c, chosen[columnKey])}
                          onChange={(e) => toggleColumn(c, e.target.checked)}
                        />
                        {c.label}
                      </label>
                    ))}
                </fieldset>
              )}
            </div>
          )}

          {list.isPending ? (
            <p>{t('loading')}</p>
          ) : list.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="font-semibold">
                {t('loadFailed')}
              </p>
              <Button variant="primary" onClick={() => void list.refetch()}>
                {common('tryAgain')}
              </Button>
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-lg">
                {filtered ? t('noMatch') : tab === 'past' ? t('nonePast') : t('noneUpcoming')}
              </p>
              {filtered && <Button onClick={clear}>{t('clearAll')}</Button>}
            </div>
          ) : (
            <>
              <p role="status" className="text-muted">
                {sortedCol
                  ? t('sortedBy', {
                      column: sortedCol.sortKey === 'date' ? t('colDate') : sortedCol.label,
                      order: t(orderKey(sortedCol.sortKind, dir)),
                    })
                  : ''}
              </p>
              {mobile ? (
                <MeetingCards meetings={meetings} meta={meta} grouped={grouped} here={here} />
              ) : (
                <MeetingTable
                  meetings={meetings}
                  columns={shown}
                  meta={meta}
                  grouped={grouped}
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  here={here}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <p>{t('showing', { shown: meetings.length, total })}</p>
                {list.hasNextPage && (
                  <Button
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {t('showMore')}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
