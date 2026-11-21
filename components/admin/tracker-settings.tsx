'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, FormField, Input, RadioChips, Select, Textarea } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { CATEGORY_PALETTE } from '@/shared/seed';
import type { FieldDef, FieldType, TrackerDef, TrackerRoles } from '@/shared/types';

/**
 * A list's name and colour, and which columns its page counts with (the "roles"): the name, the status and which
 * values mean finished, the date that matters, what to group by and which numbers to add up.
 */
export function TrackerSettings({ tracker, fields }: { tracker: TrackerDef; fields: FieldDef[] }) {
  const t = useTranslations('trackers');
  const cat = useTranslations('category');
  const client = useQueryClient();
  const [name, setName] = useState(tracker.name);
  const [itemName, setItemName] = useState(tracker.item_name);
  const [color, setColor] = useState(tracker.color);
  const [active, setActive] = useState(tracker.active);
  const [calendar, setCalendar] = useState(tracker.settings.calendar);
  const [roles, setRoles] = useState<TrackerRoles>(tracker.settings.roles);
  const [closed, setClosed] = useState(tracker.settings.roles.closed_values.join('\n'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const live = fields.filter((f) => !f.archived);
  const choices = (types: FieldType[]) => [
    { value: '', label: t('roleNone') },
    ...live.filter((f) => types.includes(f.type)).map((f) => ({ value: f.key, label: f.label })),
  ];
  const set = (k: keyof TrackerRoles, v: string) => setRoles((r) => ({ ...r, [k]: v }));

  async function save() {
    setErrors({});
    setMessage('');
    try {
      await api(`/admin/trackers/${tracker.slug}`, {
        method: 'PATCH',
        body: {
          name,
          item_name: itemName,
          color,
          active,
          calendar,
          roles: { ...roles, closed_values: closed.split('\n') },
        },
      });
      await client.invalidateQueries();
      setMessage(t('settingsSaved'));
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0)
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
      else setMessage(e instanceof ApiError ? e.message : t('saveFailed'));
    }
  }

  const select = (key: keyof TrackerRoles, label: string, types: FieldType[]) => (
    <FormField name={`role-${key}`} label={label} error={errors[key]}>
      {(c) => (
        <Select
          id={c.id}
          value={String(roles[key] ?? '')}
          onChange={(e) => set(key, e.target.value)}
          aria-describedby={c['aria-describedby']}
          options={choices(types)}
        />
      )}
    </FormField>
  );
  const numbers = choices(['number']);

  return (
    <details className="rounded-2xl border-ui border-soft bg-surface p-5 shadow-sm">
      <summary className="min-h-tap cursor-pointer text-2xl font-semibold">
        {t('settingsTitle', { name: tracker.name })}
      </summary>
      <form
        noValidate
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField name="list-name" label={t('listName')} error={errors.name}>
            {(c) => (
              <Input
                id={c.id}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField name="list-item" label={t('itemName')} error={errors.item_name}>
            {(c) => (
              <Input
                id={c.id}
                value={itemName}
                maxLength={40}
                onChange={(e) => setItemName(e.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField name="list-color" label={cat('color')} error={errors.color} group>
          {(c) => (
            <RadioChips
              aria-labelledby={c.labelId}
              value={color}
              onValueChange={setColor}
              options={CATEGORY_PALETTE.map((hex, i) => ({
                value: hex,
                label: cat(`c${i}` as 'c0'),
              }))}
            />
          )}
        </FormField>
        <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t('listActive')}
        </label>
        <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={calendar}
            onChange={(e) => setCalendar(e.target.checked)}
          />
          {t('listCalendar')}
        </label>

        <p className="text-muted">{t('settingsIntro')}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {select('title_key', t('roleTitle'), ['text'])}
          {select('status_key', t('roleStatus'), ['select'])}
          <FormField
            name="role-closed"
            label={t('roleClosed')}
            hint={t('roleClosedHint')}
            error={errors.closed_values}
          >
            {(c) => (
              <Textarea
                id={c.id}
                value={closed}
                rows={3}
                onChange={(e) => setClosed(e.target.value)}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          {select('due_key', t('roleDue'), ['date'])}
          {select('group_key', t('roleGroup'), ['select', 'text'])}
          {select('stage_key', t('roleStage'), ['select'])}
          {live.some((f) => f.type === 'stages') &&
            select('stages_key', t('roleStages'), ['stages'])}
          <FormField name="role-sum" label={t('roleSum')} error={errors.sum_keys}>
            {(c) => (
              <Select
                id={c.id}
                value={roles.sum_keys[0] ?? ''}
                onChange={(e) =>
                  setRoles((r) => ({
                    ...r,
                    sum_keys: [e.target.value, ...r.sum_keys.slice(1)].filter(Boolean),
                  }))
                }
                options={numbers}
              />
            )}
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary">
            {t('saveSettings')}
          </Button>
          <p role="status" className="font-semibold">
            {message}
          </p>
        </div>
      </form>
    </details>
  );
}
