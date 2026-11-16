'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TopBarControls } from '@/components/shell/top-bar-controls';
import { SignOutButton } from '@/components/shell/sign-out-button';
import {
  Button,
  Card,
  CardTitle,
  CheckboxGroup,
  FormField,
  Input,
  RadioChips,
  Select,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta, type Meta } from '@/lib/queries';
import { PageTitle } from '@/components/motion';

const ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];
const LENGTHS = ['15', '30', '45', '60', '90', '120', '180'];
const REMINDERS = ['10080', '1440', '60', '15'];

/** /settings (§7.11): large, grouped, plain language. */
export function SettingsScreen() {
  const t = useTranslations('settings');
  const meta = useMeta();
  if (meta.isPending) return <p>{t('loading')}</p>;
  if (meta.isError || !meta.data) return <p className="font-semibold">{t('loadFailed')}</p>;
  return <Form meta={meta.data} />;
}

function Form({ meta }: { meta: Meta }) {
  const t = useTranslations('settings');
  const form = useTranslations('form');
  const client = useQueryClient();
  const s = meta.settings;
  const [timezone, setTimezone] = useState(s.timezone);
  const [duration, setDuration] = useState(s.default_duration_min);
  const [reminders, setReminders] = useState(
    s.default_reminders
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const [calendar, setCalendar] = useState(s.calendar_id);
  const [weekStart, setWeekStart] = useState(s.week_starts_on);
  const [timeFormat, setTimeFormat] = useState(s.time_format);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const reminderLabels: Record<string, string> = {
    '10080': form('r10080'),
    '1440': form('r1440'),
    '60': form('r60'),
    '15': form('r15'),
  };
  const reminderOptions = [...new Set([...REMINDERS, ...reminders])]
    .sort((a, b) => Number(b) - Number(a))
    .map((m) => ({ value: m, label: reminderLabels[m] ?? form('rCustom', { minutes: m }) }));
  const lengthOptions = [...new Set([...LENGTHS, duration])]
    .sort((a, b) => Number(a) - Number(b))
    .map((m) => ({ value: m, label: t('minutes', { count: Number(m) }) }));

  async function save() {
    setErrors({});
    setMessage('');
    setSaving(true);
    try {
      await api('/settings', {
        method: 'PATCH',
        body: {
          timezone,
          default_duration_min: duration,
          default_reminders: [...reminders].sort((a, b) => Number(b) - Number(a)).join(','),
          calendar_id: calendar,
          week_starts_on: weekStart,
          time_format: timeFormat,
        },
      });
      await client.invalidateQueries();
      setMessage(t('saved'));
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0)
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
      else setMessage(e instanceof ApiError ? e.message : t('failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-6 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageTitle>{t('title')}</PageTitle>

      <Card>
        <CardTitle>{t('lookTitle')}</CardTitle>
        <p className="mb-3">{t('lookBody')}</p>
        <TopBarControls withMotion />
      </Card>

      <Card>
        <CardTitle>{t('timeTitle')}</CardTitle>
        <div className="flex flex-col gap-5">
          <FormField name="timezone" label={t('timezone')} error={errors.timezone}>
            {(c) => (
              <Select
                id={c.id}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                aria-describedby={c['aria-describedby']}
                options={[...new Set([...ZONES, timezone])].map((z) => ({ value: z, label: z }))}
              />
            )}
          </FormField>
          <FormField name="time_format" label={t('timeFormat')} error={errors.time_format} group>
            {(c) => (
              <RadioChips
                aria-labelledby={c.labelId}
                value={timeFormat}
                onValueChange={setTimeFormat}
                options={[
                  { value: '12h', label: t('hours12') },
                  { value: '24h', label: t('hours24') },
                ]}
              />
            )}
          </FormField>
          <FormField
            name="week_starts_on"
            label={t('weekStarts')}
            error={errors.week_starts_on}
            group
          >
            {(c) => (
              <RadioChips
                aria-labelledby={c.labelId}
                value={weekStart}
                onValueChange={setWeekStart}
                options={[
                  { value: 'monday', label: t('monday') },
                  { value: 'sunday', label: t('sunday') },
                  { value: 'saturday', label: t('saturday') },
                ]}
              />
            )}
          </FormField>
        </div>
      </Card>

      <Card>
        <CardTitle>{t('meetingsTitle')}</CardTitle>
        <div className="flex flex-col gap-5">
          <FormField
            name="default_duration_min"
            label={t('length')}
            error={errors.default_duration_min}
          >
            {(c) => (
              <Select
                id={c.id}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                aria-describedby={c['aria-describedby']}
                options={lengthOptions}
              />
            )}
          </FormField>
          <FormField
            name="default_reminders"
            label={t('reminders')}
            hint={t('remindersHint')}
            error={errors.default_reminders}
            group
          >
            {(c) => (
              <CheckboxGroup
                aria-labelledby={c.labelId}
                aria-describedby={c['aria-describedby']}
                options={reminderOptions}
                values={reminders}
                onChange={setReminders}
              />
            )}
          </FormField>
          <FormField
            name="calendar_id"
            label={t('calendar')}
            hint={t('calendarHint')}
            error={errors.calendar_id}
          >
            {(c) => (
              <Input
                id={c.id}
                value={calendar}
                onChange={(e) => setCalendar(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
              />
            )}
          </FormField>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <p role="status" className="font-semibold">
          {message}
        </p>
      </div>

      <Card>
        <CardTitle>{t('emailTitle')}</CardTitle>
        <p>{t('emailBody')}</p>
      </Card>

      <Card>
        <CardTitle>{t('homeTitle')}</CardTitle>
        <p>{t('homeBody')}</p>
      </Card>

      <Card>
        <CardTitle>{t('signOutTitle')}</CardTitle>
        <SignOutButton />
      </Card>
    </form>
  );
}
