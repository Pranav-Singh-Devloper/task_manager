import { z } from 'zod';
import { isTime } from '../../shared/dates';
import { TAB } from '../../shared/schema';
import type { Cell, Settings, SettingKey, ValidationIssue } from '../../shared/types';
import { ValidationFailed } from '../lib/errors';
import type { Actor } from './meetings';
import { parseReminders } from './calendarEvent';
import type { SheetStore } from './store';

const timezoneOk = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** One rule per setting, with a plain message for each. */
const RULES: Record<SettingKey, (v: string) => string | null> = {
  timezone: (v) => (timezoneOk(v) ? null : 'Please choose a time zone from the list.'),
  default_duration_min: (v) =>
    /^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 480
      ? null
      : 'Please choose a length between 5 minutes and 8 hours.',
  default_reminders: (v) => {
    try {
      parseReminders(v, '');
      return v.trim() === '' ? 'Please keep at least one reminder.' : null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Please check the reminders.';
    }
  },
  calendar_id: (v) =>
    v.length > 0 && v.length <= 200 ? null : 'Please say which calendar to use.',
  week_starts_on: (v) =>
    ['monday', 'sunday', 'saturday'].includes(v)
      ? null
      : 'Please choose Monday, Sunday or Saturday.',
  time_format: (v) =>
    v === '12h' || v === '24h' ? null : 'Please choose 12-hour or 24-hour time.',
  digest_enabled: (v) => (v === 'TRUE' || v === 'FALSE' ? null : 'Please choose On or Off.'),
  digest_time: (v) => (isTime(v) ? null : 'Please choose a valid time.'),
  digest_email: (v) =>
    v === '' || z.string().email().safeParse(v).success
      ? null
      : 'Please enter a valid email address.',
  max_upload_mb: (v) =>
    /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100
      ? null
      : 'Please choose a size between 1 and 100 MB.',
};

export const SETTING_KEYS = Object.keys(RULES) as SettingKey[];

/** Normalises a value as text, the way it is stored in the _settings tab. */
function asText(key: SettingKey, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const s = String(value ?? '').trim();
  if (key === 'default_reminders') {
    try {
      return parseReminders(s, '').join(',');
    } catch {
      return s;
    }
  }
  if (key === 'digest_enabled')
    return /^(true|yes|on|1)$/i.test(s) ? 'TRUE' : /^(false|no|off|0)$/i.test(s) ? 'FALSE' : s;
  return s;
}

export function validateSettings(patch: Record<string, unknown>): {
  values: Partial<Settings>;
  issues: ValidationIssue[];
} {
  const values: Partial<Settings> = {};
  const issues: ValidationIssue[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue; // unknown settings are ignored
    const text = asText(key as SettingKey, raw);
    const problem = RULES[key as SettingKey](text);
    if (problem) issues.push({ field: key, message: problem });
    else values[key as SettingKey] = text;
  }
  return { values, issues };
}

/** Saves changed settings to the _settings tab and reloads the cache so every screen sees them. */
export async function updateSettings(
  store: SheetStore,
  patch: Record<string, unknown>,
  actor: Actor,
): Promise<Settings> {
  const { values, issues } = validateSettings(patch);
  if (issues.length > 0) throw new ValidationFailed(issues);

  const snap = await store.snapshot();
  const tab = snap.tabs.find((t) => t.title === TAB.settings);
  if (!tab)
    throw new ValidationFailed([
      { field: 'form', message: 'The settings could not be found in the spreadsheet.' },
    ]);

  const changes: Record<string, [unknown, unknown]> = {};
  await store.mutex.run(store.tabKey(tab.gid), async () => {
    const rows =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    for (const [key, value] of Object.entries(values) as [SettingKey, string][]) {
      const index = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === key);
      const old = index > 0 ? String(rows[index]?.[1] ?? '') : snap.config.settings[key];
      if (old === value) continue;
      changes[key] = [old, value];
      const row: Cell[] = [key, value];
      if (index > 0)
        await store.google.sheets.updateRow(store.spreadsheetId, tab.gid, index + 1, row);
      else await store.google.sheets.appendRows(store.spreadsheetId, tab.gid, [row]);
    }
  });
  if (Object.keys(changes).length > 0) {
    await store.log.audit({
      user: actor.email,
      action: 'config',
      table: TAB.settings,
      rowId: Object.keys(changes).join(','),
      changes,
      source: actor.source,
    });
    return (await store.refresh()).config.settings;
  }
  return snap.config.settings;
}
