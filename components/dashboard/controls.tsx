'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormField, Input, RadioChips, Select } from '@/components/ui';
import type { DashboardParams, Range } from '@/lib/dashboard-params';
import type { Meta } from '@/lib/queries';
import { MEETING_STATUSES } from '@/shared/types';

interface Props {
  meta: Meta;
  params: DashboardParams;
  update: (patch: Partial<DashboardParams>) => void;
}

const ALL = 'all';

/** Search, kind, workspace, dates and status (§7.2). Typing in the search box waits a moment before it searches. */
export function Controls({ meta, params, update }: Props) {
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
    <div className="flex flex-col gap-4">
      <FormField name="search" label={t('searchLabel')}>
        {(c) => (
          <Input
            id={c.id}
            type="search"
            value={draft ?? params.q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            className="text-lg"
          />
        )}
      </FormField>

      <div className="grid gap-4 md:grid-cols-3">
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

      {params.range === 'custom' && (
        <div className="grid gap-4 md:grid-cols-3">
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

      <FormField name="workspace" label={t('workspace')} group>
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
    </div>
  );
}
