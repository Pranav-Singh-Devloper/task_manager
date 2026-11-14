'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo } from 'react';
import { dateText, timeText, valueText } from '@/components/meeting/format';
import type { Meta } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';
import { orderKey, type Col } from './columns';
import { CategoryChip, JoinButton, RescheduleButton, StatusCell, TitleCell } from './row-bits';

interface Props {
  meetings: Meeting[];
  columns: Col[];
  meta: Meta;
  /** Date headings are only used while the list is in date order. */
  grouped: boolean;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (col: Col) => void;
  here: string;
}

/** The table view: rows grouped under date headings, a sortable header, and a Reschedule button on every open row. */
export function MeetingTable({ meetings, columns, meta, grouped, sort, dir, onSort, here }: Props) {
  const t = useTranslations('dashboard');
  const common = useTranslations('common');
  const router = useRouter();
  const words = { yes: common('yes'), no: common('no') };

  const defs = useMemo<ColumnDef<Meeting>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        header: col.label,
        cell: ({ row }) => {
          const m = row.original;
          const v = m.values;
          switch (col.id) {
            case 'time': {
              const date = typeof v.date === 'string' ? v.date : null;
              const start =
                typeof v.start_time === 'string' ? timeText(v.start_time, meta.settings) : '';
              // Under a date heading the date is already there, so only the time is needed.
              return (
                <span className="whitespace-nowrap font-semibold">
                  {grouped || !date ? start : `${dateText(date, meta.settings)} · ${start}`}
                </span>
              );
            }
            case 'category':
              return <CategoryChip meeting={m} meta={meta} />;
            case 'title':
              return <TitleCell meeting={m} />;
            case 'status':
              return <StatusCell meeting={m} />;
            case 'join':
              return <JoinButton meeting={m} />;
            case 'actions':
              return <RescheduleButton meeting={m} here={here} />;
            default: {
              const f = col.field;
              if (!f) return null;
              const raw = f.type === 'computed' ? m.computed[f.key] : v[f.key];
              return (
                valueText(f, raw, meta.settings, words) ?? <span className="text-muted">{'—'}</span>
              );
            }
          }
        },
      })),
    // `words` is rebuilt every render but never changes meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, meta, grouped, here],
  );

  // TanStack Table's hook cannot be auto-memoised by the React Compiler. That only means this component is not optimised.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: meetings,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });
  const rows = table.getRowModel().rows;
  const width = columns.length;

  // Rows stay in the order the server sent them; a new heading starts whenever the date changes.
  const sections: { date: string | null; rows: typeof rows }[] = [];
  for (const row of rows) {
    const date = grouped
      ? typeof row.original.values.date === 'string'
        ? row.original.values.date
        : ''
      : null;
    const last = sections[sections.length - 1];
    if (last && last.date === date) last.rows.push(row);
    else sections.push({ date, rows: [row] });
  }

  // `relative` keeps the hidden screen-reader text inside the scrolling box instead of stretching the page.
  return (
    <div className="relative overflow-x-auto rounded-xl border-ui border-line bg-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t('tableCaption')}</caption>
        <thead>
          <tr className="border-b-ui border-line">
            {columns.map((col) => {
              const active = Boolean(col.sortKey) && (sort || 'date') === col.sortKey;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={
                    active
                      ? dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : col.sortKey
                        ? 'none'
                        : undefined
                  }
                  className="px-4 py-2 align-middle text-base font-semibold"
                >
                  {col.sortKey ? (
                    <button
                      type="button"
                      onClick={() => onSort(col)}
                      className="inline-flex min-h-tap items-center gap-2 text-left font-semibold underline-offset-4 hover:underline"
                    >
                      {col.label}
                      {active && <span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>}
                      <span className="sr-only">
                        {active
                          ? t('sortedBy', {
                              column: col.label,
                              order: t(orderKey(col.sortKind, dir)),
                            })
                          : t('sortBy', { column: col.label })}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        {sections.map((section, i) => (
          <tbody key={`${section.date}-${i}`}>
            {section.date !== null && (
              <tr>
                <th
                  colSpan={width}
                  scope="colgroup"
                  className="bg-page px-4 py-3 text-lg font-semibold"
                >
                  {section.date ? dateText(section.date, meta.settings) : t('colDate')}
                </th>
              </tr>
            )}
            {section.rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t-ui border-soft align-top hover:bg-page"
                onClick={(e) => {
                  // A click anywhere on the row opens it, unless it was on a link or button of its own.
                  if ((e.target as HTMLElement).closest('a, button')) return;
                  router.push(`/meetings/${row.original.id}`);
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top">
                    <Fragment>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Fragment>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
