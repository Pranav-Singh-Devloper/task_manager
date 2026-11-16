'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses, ConfirmDialog, FormField, Input, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta } from '@/lib/queries';
import type { Cell } from '@/shared/types';
import type { GridColumn, GridRow } from './admin-grid';

const AdminGrid = dynamic(() => import('./admin-grid'), {
  ssr: false,
  loading: () => <p>{'…'}</p>,
});

interface TableInfo {
  name: string;
  label: string;
  kind: 'category' | 'config' | 'log';
  editable: boolean;
  rows: number | null;
  category_slug: string | null;
}
interface TableList {
  tables: TableInfo[];
  spreadsheet_url: string;
  mock: boolean;
}
interface TableData {
  table: TableInfo;
  columns: GridColumn[];
  rows: GridRow[];
  total: number;
}

const LIMIT = 2000;

/** Admin, Data tables (§7.9 a): every table in the database, shown like a spreadsheet. */
export function TablesScreen() {
  const t = useTranslations('admin');
  const client = useQueryClient();
  const meta = useMeta();
  const list = useQuery({
    queryKey: ['admin', 'tables'],
    queryFn: () => api<TableList>('/admin/tables'),
  });
  const [picked, setPicked] = useState('');
  const [quick, setQuick] = useState('');
  const [raw, setRaw] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [selected, setSelected] = useState<GridRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [shown, setShown] = useState<number | null>(null);

  const name = picked || list.data?.tables[0]?.name || '';
  const data = useQuery({
    queryKey: ['admin', 'table', name],
    queryFn: () => api<TableData>(`/admin/tables/${encodeURIComponent(name)}?limit=${LIMIT}`),
    enabled: Boolean(name),
  });

  if (list.isPending) return <p>{t('loading')}</p>;
  if (list.isError || !list.data) return <p className="font-semibold">{t('loadFailed')}</p>;

  const table = list.data.tables.find((x) => x.name === name);
  const refresh = () => client.invalidateQueries({ queryKey: ['admin'] });
  const timeFormat = meta.data?.settings.time_format === '24h' ? '24h' : '12h';

  async function edit(row: GridRow, key: string, value: Cell) {
    setMessage('');
    try {
      await api(`/admin/tables/${encodeURIComponent(name)}/rows/${String(row.__id)}`, {
        method: 'PATCH',
        body: { rev: Number(row.__rev), values: { [key]: value } },
      });
      await client.invalidateQueries();
      setMessage(t('cellSaved'));
    } catch (e) {
      await refresh();
      setMessage(e instanceof ApiError ? e.message : t('cellFailed'));
      throw e;
    }
  }

  async function removeRow() {
    if (!selected) return;
    setConfirmDelete(false);
    try {
      await api(
        `/admin/tables/${encodeURIComponent(name)}/rows/${String(selected.__id)}?rev=${Number(selected.__rev)}`,
        {
          method: 'DELETE',
        },
      );
      setSelected(null);
      await client.invalidateQueries();
      setMessage(t('rowDeleted'));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t('cellFailed'));
    }
  }

  return (
    <section aria-labelledby="tables-heading" className="flex flex-col gap-4">
      <h2 id="tables-heading">{t('tabTables')}</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem]">
          <FormField name="table" label={t('table')}>
            {(c) => (
              <Select
                id={c.id}
                value={name}
                onChange={(e) => {
                  setPicked(e.target.value);
                  setSelected(null);
                  setMessage('');
                }}
                options={list.data.tables.map((x) => ({
                  value: x.name,
                  label: x.label === x.name ? x.name : `${x.label} (${x.name})`,
                }))}
              />
            )}
          </FormField>
        </div>
        <div className="min-w-[14rem] flex-1">
          <FormField name="quick" label={t('quickSearch')}>
            {(c) => (
              <Input
                id={c.id}
                type="search"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
              />
            )}
          </FormField>
        </div>
      </div>

      {table && !table.editable && (
        <p
          role="note"
          className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-3"
        >
          <span className="font-semibold">
            {table.kind === 'config' ? t('readOnlyConfig') : t('readOnlyLog')}
          </span>
          {table.kind === 'config' && (
            <>
              <Link href="/admin/columns" className={buttonClasses('outline')}>
                {t('tabColumns')}
              </Link>
              <Link href="/settings" className={buttonClasses('outline')}>
                {t('settings')}
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {table?.editable && table.category_slug && (
          <Link
            href={`/meetings/new?category=${table.category_slug}`}
            className={buttonClasses('outline')}
          >
            {t('addRow')}
          </Link>
        )}
        {table?.editable && (
          <Button
            disabled={!selected || Boolean(selected.__deleted)}
            onClick={() => setConfirmDelete(true)}
          >
            {t('deleteRow')}
          </Button>
        )}
        <a
          href={`/api/admin/export/${encodeURIComponent(name)}?format=csv`}
          className={buttonClasses('outline')}
        >
          {t('exportCsv')}
        </a>
        <a
          href={`/api/admin/export/${encodeURIComponent(name)}?format=xlsx`}
          className={buttonClasses('outline')}
        >
          {t('exportExcel')}
        </a>
        <a
          href={list.data.spreadsheet_url}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses('outline')}
        >
          {t('openSheets')}
        </a>
        <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={raw}
            onChange={(e) => setRaw(e.target.checked)}
          />
          {t('showRaw')}
        </label>
        <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={frozen}
            onChange={(e) => setFrozen(e.target.checked)}
          />
          {t('freeze')}
        </label>
      </div>

      <p role="status" className="font-semibold">
        {message || (data.data ? t('rowCount', { count: shown ?? data.data.total }) : '')}
        {data.data && data.data.total > data.data.rows.length
          ? ` ${t('rowsCut', { shown: data.data.rows.length })}`
          : ''}
      </p>

      {data.isPending ? (
        <p>{t('loading')}</p>
      ) : data.isError || !data.data ? (
        <p className="font-semibold">{t('loadFailed')}</p>
      ) : (
        <AdminGrid
          key={name}
          columns={data.data.columns}
          rows={data.data.rows}
          editable={Boolean(table?.editable)}
          raw={raw}
          frozen={frozen}
          quickFilter={quick}
          timeFormat={timeFormat}
          onEdit={edit}
          onSelect={setSelected}
          onCount={setShown}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteRowTitle')}
        description={t('deleteRowBody')}
        confirmLabel={t('deleteRow')}
        destructive
        onConfirm={() => void removeRow()}
      />
    </section>
  );
}
