'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { FormField, Input, RadioChips, Select } from '@/components/ui';
import type { DashboardParams, Range } from '@/lib/dashboard-params';
import type { Meta } from '@/lib/queries';
import { MEETING_STATUSES } from '@/shared/types';

interface Props {
  meta: Meta;
  params: DashboardParams;
  update: (patch: Partial<DashboardParams>) => void;
  /** Buttons shown on the same row as the workspace choice (filters, Upcoming or Past, Table or Calendar). */
  children?: ReactNode;
}

const ALL = 'all';

/**
 * Search, kind, workspace, dates and status (§7.2), packed tightly: on a computer search and the three lists share
 * one row, and the workspace choice shares the next with the view buttons. Typing in the search box waits a moment
 * before it searches.
 */
export function Controls({ meta, params, update, children }: Props) {
  const t = useTranslations('dashboard');
  // What is typed shows at once. null means "show what the address says", for example after Clear all.
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => {
      update({ q: draft });
      setDraft(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, update]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 lg:col-span-1">
          <FormField name="search" label={t('searchLabel')}>
            {(c) => (
              <Input
                id={c.id}
                type="search"
                value={draft ?? params.q}
                placeholder={t('searchPlaceholder')}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField name="category" label={t('category')}>
          {(c) => (
            <Select
              id={c.id}
              value={params.category}
              onChange={(e) => update({ category: e.target.value })}
              placeholder={t('allCategories')}
              options={meta.categories
                .filter((x) => x.active)
                .map((x) => ({ value: x.slug, label: x.name }))}
            />
          )}
        </FormField>
        <FormField name="range" label={t('range')}>
          {(c) => (
            <Select
              id={c.id}
              value={params.range}
              onChange={(e) => update({ range: e.target.value as Range })}
              options={[
                { value: 'any', label: t('rangeAny') },
                { value: 'today', label: t('rangeToday') },
                { value: 'week', label: t('rangeWeek') },
                { value: 'month', label: t('rangeMonth') },
                { value: 'custom', label: t('rangeCustom') },
              ]}
            />
          )}
        </FormField>
        <div className="col-span-2 sm:col-span-1">
          <FormField name="status" label={t('status')}>
            {(c) => (
              <Select
                id={c.id}
                value={params.status}
                onChange={(e) => update({ status: e.target.value })}
                placeholder={t('allStatuses')}
                options={MEETING_STATUSES.map((s) => ({ value: s, label: s }))}
              />
            )}
          </FormField>
        </div>
      </div>

      {params.range === 'custom' && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FormField name="from" label={t('from')}>
            {(c) => (
              <Input
                id={c.id}
                type="date"
                value={params.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            )}
          </FormField>
          <FormField name="to" label={t('to')}>
            {(c) => (
              <Input
                id={c.id}
                type="date"
                value={params.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            )}
          </FormField>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FormField name="workspace" label={t('workspace')} group inline>
          {(c) => (
            <RadioChips
              aria-labelledby={c.labelId}
              value={params.workspace || ALL}
              onValueChange={(v) => update({ workspace: v === ALL ? '' : v })}
              options={[
                { value: ALL, label: t('allWorkspaces') },
                ...meta.workspaces.map((w) => ({ value: w.slug, label: w.name })),
              ]}
            />
          )}
        </FormField>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </div>
  );
}
