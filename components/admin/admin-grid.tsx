'use client';

import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef } from 'react';
import { friendlyTime } from '@/shared/dates';
import { fullDate } from '@/components/meeting/format';
import type { Cell } from '@/shared/types';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface GridColumn {
  key: string;
  label: string;
  type: string;
  readonly: boolean;
  computed: boolean;
  options: string[];
}
export type GridRow = Record<string, Cell>;

interface Props {
  columns: GridColumn[];
  rows: GridRow[];
  editable: boolean;
  raw: boolean;
  frozen: boolean;
  quickFilter: string;
  timeFormat: '12h' | '24h';
  onEdit: (row: GridRow, key: string, value: Cell) => Promise<void>;
  onSelect: (row: GridRow | null) => void;
  /** How many rows are showing after the search and filters. */
  onCount: (shown: number) => void;
}

const theme = themeQuartz.withParams({
  fontSize: 16,
  rowHeight: 48,
  headerHeight: 52,
  accentColor: '#1e40af',
  backgroundColor: '#ffffff',
  foregroundColor: '#0b1220',
  borderColor: '#64748b',
  headerBackgroundColor: '#f6f7f9',
});

const EDITORS: Record<string, Partial<ColDef>> = {
  long_text: { cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true },
  number: { cellEditor: 'agNumberCellEditor' },
  checkbox: { cellEditor: 'agCheckboxCellEditor' },
  date: { cellEditor: 'agDateStringCellEditor' },
};

/** The raw database, Excel-style (§7.9 a): resize, reorder, sort, filter, freeze, and type-aware editing. */
export default function AdminGrid({
  columns,
  rows,
  editable,
  raw,
  frozen,
  quickFilter,
  timeFormat,
  onEdit,
  onSelect,
  onCount,
}: Props) {
  const t = useTranslations('admin');
  const api = useRef<GridApi | null>(null);

  const defs = useMemo<ColDef[]>(
    () =>
      columns.map((c, i) => {
        const base: ColDef = {
          field: c.key,
          headerName: c.computed ? t('calculatedHeader', { name: c.label }) : c.label,
          headerTooltip: c.key,
          editable: editable && !c.readonly,
          pinned: frozen && i < 2 ? 'left' : undefined,
          minWidth: 120,
        };
        if (c.type === 'select' && c.options.length > 0) {
          base.cellEditor = 'agSelectCellEditor';
          base.cellEditorParams = { values: ['', ...c.options] };
        } else if (EDITORS[c.type]) Object.assign(base, EDITORS[c.type]);
        if (!raw) {
          if (c.type === 'date')
            base.valueFormatter = (p) =>
              typeof p.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.value)
                ? fullDate(p.value)
                : String(p.value ?? '');
          else if (c.type === 'time')
            base.valueFormatter = (p) =>
              typeof p.value === 'string' && /^\d{2}:\d{2}$/.test(p.value)
                ? friendlyTime(p.value, timeFormat)
                : String(p.value ?? '');
          else if (c.type === 'checkbox')
            base.valueFormatter = (p) =>
              p.value === true ? t('yes') : p.value === false ? t('no') : '';
        }
        return base;
      }),
    [columns, editable, frozen, raw, t, timeFormat],
  );

  const onCellValueChanged = (e: CellValueChangedEvent<GridRow>) => {
    const key = e.colDef.field;
    if (!key || e.newValue === e.oldValue) return;
    void onEdit(e.data as GridRow, key, (e.newValue ?? '') as Cell).catch(() => {
      // The screen shows the reason and reloads the rows, which puts the old value back.
    });
  };

  return (
    <div className="h-[65vh] min-h-[24rem] w-full" role="region" aria-label={t('gridLabel')}>
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        columnDefs={defs}
        defaultColDef={{ resizable: true, sortable: true, filter: true }}
        quickFilterText={quickFilter}
        rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
        getRowId={(p) => String(p.data.__id)}
        stopEditingWhenCellsLoseFocus
        onGridReady={(e: GridReadyEvent) => {
          api.current = e.api;
        }}
        onSelectionChanged={(e) =>
          onSelect((e.api.getSelectedRows()[0] as GridRow | undefined) ?? null)
        }
        onCellValueChanged={onCellValueChanged}
        onModelUpdated={(e) => onCount(e.api.getDisplayedRowCount())}
        getRowClass={(p) => (p.data?.__deleted ? 'opacity-60' : undefined)}
      />
    </div>
  );
}
