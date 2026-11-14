import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { calendarEventIdFor, newId } from '../../../../shared/ids';
import { RESCHEDULE_HEADERS, TAB, rowFromObject } from '../../../../shared/schema';
import { renderTitle } from '../../../../shared/titles';
import type { Cell } from '../../../../shared/types';
import type { CreatedDatabase } from '../../databaseSeed';
import type { GoogleServices } from '../types';

interface DemoMeeting {
  key: string;
  category: string;
  offset: number;
  time: string;
  endTime?: string;
  status: 'Scheduled' | 'Rescheduled' | 'Completed' | 'Cancelled';
  previous?: string;
  values: Record<string, Cell>;
}

const MEET = 'https://meet.google.com/abc-defg-hij';

/** Day offsets are relative to today in the configured timezone, so the demo always has upcoming and past meetings. */
const DEMO: DemoMeeting[] = [
  {
    key: 'ccie1',
    category: 'ccie',
    offset: -21,
    time: '10:30',
    status: 'Completed',
    values: {
      case_id: 'C-101',
      project_name: 'NH-44 Four Laning, Km 120 to 180',
      status: 'Hearing held',
      status_of_dispute: 'Under conciliation',
      allocated_ccie: 'Dr. R. K. Verma',
      piu: 'PIU Gwalior',
      ro: 'RO Bhopal',
      state: 'Madhya Pradesh',
      contractor: 'Shree Infra Ltd',
      date_of_initiation: '2025-02-10',
      details: '— Notes, first sitting —\nBoth parties presented claims.',
    },
  },
  {
    key: 'ccie2',
    category: 'ccie',
    offset: -7,
    time: '11:00',
    status: 'Completed',
    previous: 'ccie1',
    values: {
      case_id: 'C-101',
      project_name: 'NH-44 Four Laning, Km 120 to 180',
      status: 'Hearing held',
      status_of_dispute: 'Under conciliation',
      allocated_ccie: 'Dr. R. K. Verma',
      piu: 'PIU Gwalior',
      ro: 'RO Bhopal',
      state: 'Madhya Pradesh',
      contractor: 'Shree Infra Ltd',
      date_of_initiation: '2025-02-10',
    },
  },
  {
    key: 'ccie3',
    category: 'ccie',
    offset: 2,
    time: '11:00',
    status: 'Scheduled',
    previous: 'ccie2',
    values: {
      case_id: 'C-101',
      project_name: 'NH-44 Four Laning, Km 120 to 180',
      status: 'Awaiting reply',
      status_of_dispute: 'Under conciliation',
      allocated_ccie: 'Dr. R. K. Verma',
      piu: 'PIU Gwalior',
      ro: 'RO Bhopal',
      state: 'Madhya Pradesh',
      contractor: 'Shree Infra Ltd',
      date_of_initiation: '2025-02-10',
      meeting_link: MEET,
    },
  },
  {
    key: 'ccie4',
    category: 'ccie',
    offset: 5,
    time: '15:00',
    status: 'Rescheduled',
    values: {
      case_id: 'C-102',
      project_name: 'NH-48 Six Laning, Package 3',
      status: 'Notice issued',
      state: 'Rajasthan',
      contractor: 'Marudhar Constructions',
      ro: 'RO Jaipur',
      date_of_initiation: '2025-08-20',
    },
  },
  {
    key: 'sfc',
    category: 'sfc_pppac',
    offset: 1,
    time: '10:30',
    status: 'Scheduled',
    values: { topic: 'SFC: appraisal of Delhi-Vadodara spur', meeting_link: MEET },
  },
  {
    key: 'morth',
    category: 'morth',
    offset: 3,
    time: '16:00',
    status: 'Scheduled',
    values: {
      topic: 'MORTH review of award targets',
      remarks: 'Bring the quarterly progress sheet',
    },
  },
  {
    key: 'pmg',
    category: 'pmg',
    offset: 4,
    time: '12:00',
    status: 'Scheduled',
    values: { topic: 'PMG: stalled projects' },
  },
  {
    key: 'patsc',
    category: 'patsc_iac',
    offset: -2,
    time: '14:30',
    status: 'Completed',
    values: { topic: 'PATSC review, March batch' },
  },
  {
    key: 'file',
    category: 'file_discussion',
    offset: 0,
    time: '17:00',
    endTime: '17:30',
    status: 'Scheduled',
    values: {
      topic: 'File discussion: land acquisition note',
      details: 'Discuss pending objections before the note goes up.',
    },
  },
  {
    key: 'at1',
    category: 'at',
    offset: 6,
    time: '10:00',
    status: 'Scheduled',
    values: {
      name_of_project: 'Kanpur Ring Road, Package 2',
      mode: 'HAM',
      length: 42.5,
      civil_cost: 1280,
      total_cost: 1710,
      bid_due_date: '2026-12-18',
      ae_ie: 'M/s Consulting Engineers',
    },
  },
  {
    key: 'court',
    category: 'court_case',
    offset: 8,
    time: '11:30',
    status: 'Scheduled',
    values: { topic: 'High Court hearing, writ petition 4821', meeting_link: '' },
  },
  {
    key: 'court2',
    category: 'court_case',
    offset: -5,
    time: '10:30',
    status: 'Completed',
    values: { topic: 'High Court hearing, writ petition 4821 (previous sitting)' },
  },
  {
    key: 'others',
    category: 'others',
    offset: 9,
    time: '09:30',
    status: 'Scheduled',
    values: { topic: 'Review meeting with Chairman', workspace: 'nhai' },
  },
  {
    key: 'sup',
    category: 'supervisor_meeting',
    offset: 7,
    time: '18:00',
    status: 'Scheduled',
    values: { topic: 'Supervisor meeting: literature review chapter', meeting_link: MEET },
  },
  {
    key: 'phd',
    category: 'phd_milestone',
    offset: 30,
    time: '09:00',
    status: 'Scheduled',
    values: { topic: 'Thesis synopsis submission deadline' },
  },
];

function plusMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Appends realistic meetings for every category, plus calendar events for the upcoming ones. */
export async function seedDemoMeetings(
  google: Pick<GoogleServices, 'sheets' | 'calendar'>,
  db: CreatedDatabase,
  now: Date,
  timezone: string,
): Promise<void> {
  const today = parseISO(formatInTimeZone(now, timezone, 'yyyy-MM-dd'));
  const ids = new Map<string, string>(DEMO.map((m) => [m.key, newId()]));
  const srByCategory = new Map<string, number>();
  const rowsByCategory = new Map<string, Cell[][]>();
  const rescheduleRows: Cell[][] = [];
  const createdAt = now.toISOString();

  for (const m of DEMO) {
    const category = db.config.categories.find((c) => c.slug === m.category);
    if (!category) continue;
    const id = ids.get(m.key) as string;
    const date = format(addDays(today, m.offset), 'yyyy-MM-dd');
    const sr = (srByCategory.get(m.category) ?? 0) + 1;
    srByCategory.set(m.category, sr);
    const endTime = m.endTime ?? plusMinutes(m.time, 60);
    const upcoming = m.offset >= 0 && m.status !== 'Completed' && m.status !== 'Cancelled';
    const title = m.values.topic
      ? String(m.values.topic)
      : renderTitle(category.title_template, m.values);

    const obj: Record<string, Cell> = {
      sr_no: sr,
      date,
      start_time: m.time,
      end_time: endTime,
      meeting_status: m.status,
      workspace: category.default_workspace,
      ...m.values,
      id,
      rev: 1,
      created_at: createdAt,
      updated_at: createdAt,
      created_by: 'demo',
      calendar_event_id: upcoming ? calendarEventIdFor(id) : '',
      calendar_sync: upcoming ? 'ok' : 'none',
      previous_id: m.previous ? (ids.get(m.previous) ?? '') : '',
    };
    const headers = db.headers[m.category] as string[];
    const rows = rowsByCategory.get(m.category) ?? [];
    rows.push(rowFromObject(headers, obj));
    rowsByCategory.set(m.category, rows);

    if (m.status === 'Rescheduled') {
      rescheduleRows.push(
        rowFromObject(RESCHEDULE_HEADERS, {
          id: newId(),
          meeting_id: id,
          category_slug: m.category,
          old_date: format(addDays(today, m.offset - 2), 'yyyy-MM-dd'),
          old_start: m.time,
          old_end: endTime,
          new_date: date,
          new_start: m.time,
          new_end: endTime,
          reason: 'Officer unavailable',
          source: 'app',
          changed_at: createdAt,
        }),
      );
    }

    if (upcoming) {
      await google.calendar.insertEvent('primary', {
        id: calendarEventIdFor(id),
        summary: `[${category.name}] ${title}`,
        description: '',
        start: { dateTime: `${date}T${m.time}:00`, timeZone: timezone },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: timezone },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 1440 },
            { method: 'popup', minutes: 60 },
          ],
        },
        extendedProperties: { private: { mmMeetingId: id, mmCategory: m.category } },
      });
    }
  }

  for (const [slug, rows] of rowsByCategory) {
    const gid = db.config.categories.find((c) => c.slug === slug)?.sheet_gid;
    if (gid !== null && gid !== undefined)
      await google.sheets.appendRows(db.spreadsheetId, gid, rows);
  }
  if (rescheduleRows.length > 0) {
    const tabs = await google.sheets.getTabs(db.spreadsheetId);
    const gid = tabs.find((t) => t.title === TAB.reschedules)?.gid;
    if (gid !== undefined) await google.sheets.appendRows(db.spreadsheetId, gid, rescheduleRows);
  }
}
