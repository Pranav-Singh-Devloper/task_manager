import { createHash } from 'node:crypto';
import { parseCategories, parseFields, parseSettings } from '../../shared/configRows';
import { DEFAULT_SETTINGS, TAB } from '../../shared/schema';
import type { Cell, FieldDef, FieldType, Settings, TrackerRoles } from '../../shared/types';

/**
 * A one-time copy of the previous owner's database into the current owner's (2026-11-22). This file only reads the
 * old spreadsheet's cells and works out what to add; nothing is written here. No data is kept in code: the column
 * names below are the app's own, and the rules are written out so the plan can be checked before it runs.
 *
 * What the old database held, and where each part goes:
 * - Meetings saved through the app (rows with an id and a date) are copied with their ids, so their calendar events,
 *   links and history line up. A meeting starting between midnight and 6 AM was almost certainly meant for the
 *   afternoon (the 12-hour clock), and is moved by 12 hours.
 * - Rows typed or pasted into a meeting tab without an id were never shown by the app. They are tables pasted from
 *   other sheets, so they go to lists: the award-plan table to Award Plan, the conciliation cases under CCIE to a
 *   "CCIE Cases" list, and the works table (pasted under Others without its headings) to an "NRCW Targets" list.
 * - Meeting kinds someone added are made again, except a kind whose Date and Time columns were renamed (it was being
 *   used as a list; its list is made instead).
 * - Rows plainly made for testing (named "testing") are left behind.
 */

export type Raw = Record<string, Cell[][]>;

export interface MeetingImport {
  id: string;
  /** The kind's short name in the new database. */
  category: string;
  values: Record<string, unknown>;
  title: string;
}

export interface FieldImport {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  allow_new_options?: boolean;
  unit?: string;
  help_text?: string;
  show_in_table?: boolean;
}

export interface ListImport {
  /** Rows go to this existing list... */
  existingSlug?: string;
  /** ...or a list is made with this name. */
  name?: string;
  itemName?: string;
  color?: string;
  /** New lists start with Name, Status, Due date and Remarks: their labels and choices are set here. */
  starting?: Record<string, { label?: string; options?: string[]; archived?: boolean }>;
  fields?: FieldImport[];
  roles?: Partial<TrackerRoles>;
  rows: { id: string; values: Record<string, unknown> }[];
}

export interface ImportPlan {
  settings: Partial<Settings>;
  /**
   * The old database's columns of the meeting kinds being copied. Where the owner changed a column (made it optional,
   * renamed it, showed it in the table), the same change is made in the new database before meetings are copied.
   */
  oldFields: FieldDef[];
  categories: { name: string; color: string; oldSlug: string }[];
  meetings: MeetingImport[];
  lists: ListImport[];
  /** Plain-language notes on every correction and everything left behind. */
  notes: string[];
}

const text = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : String(c).replace(/\r\n/g, '\n').trim();
const isBlank = (row: Cell[] | undefined) => !row || row.every((c) => text(c) === '');
const PLACEHOLDER = /^(-+|_+|na|n\/a|nil|none|0)$/i;
const blankish = (s: string) => s === '' || PLACEHOLDER.test(s);

/** "15.01.2026" or "15/01/2026" (day first). */
export function dmy(s: string): string | null {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  return iso(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** "10/22/2026" (month first, as a spreadsheet in US format shows it). */
export function mdy(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return iso(Number(m[3]), Number(m[1]), Number(m[2]));
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function num(s: string): number | null {
  const t = s.replace(/,/g, '').trim();
  if (blankish(t) && t !== '0') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A fixed id for a copied row, so running the copy twice never adds a row twice. */
export function stableId(key: string): string {
  const bytes = createHash('sha256').update(key).digest();
  let out = '0';
  for (let i = 0; out.length < 26; i++) out += CROCKFORD[(bytes[i] as number) % 32];
  return out;
}

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function addHours(time: string, h: number): string {
  const [hh, mm] = time.split(':').map(Number);
  return `${String(((hh ?? 0) + h) % 24).padStart(2, '0')}:${String(mm ?? 0).padStart(2, '0')}`;
}

export function buildPlan(raw: Raw, tabTitleByGid: Map<number, string>): ImportPlan {
  const notes: string[] = [];
  const cats = parseCategories(raw[TAB.categories] ?? []).items;
  const fields = parseFields(raw[TAB.fields] ?? []).items;
  const tabOf = (slug: string) => {
    const gid = cats.find((c) => c.slug === slug)?.sheet_gid;
    return gid === null || gid === undefined ? undefined : tabTitleByGid.get(gid);
  };
  const rowsOf = (slug: string) => raw[tabOf(slug) ?? ''] ?? [];

  // ---------- settings ----------
  const old = parseSettings(raw[TAB.settings] ?? []);
  const settings: Partial<Settings> = {};
  for (const k of [
    'default_duration_min',
    'default_reminders',
    'time_format',
    'week_starts_on',
  ] as const) {
    if (old[k] !== DEFAULT_SETTINGS[k]) settings[k] = old[k];
  }

  // ---------- meeting kinds ----------
  const categories: ImportPlan['categories'] = [];
  const skippedKinds = new Set<string>();
  for (const c of cats.filter((x) => !x.is_seed)) {
    const own = fields.filter((f) => f.category_slug === c.slug);
    const renamed = own.some(
      (f) =>
        (f.key === 'date' && f.label !== 'Date') || (f.key === 'start_time' && f.label !== 'Time'),
    );
    if (renamed) {
      skippedKinds.add(c.slug);
      notes.push(
        `The meeting kind "${c.name}" had its Date and Time columns renamed, so it was being used as a list. It is not made again as a meeting kind; its rows become a list instead.`,
      );
      continue;
    }
    categories.push({ name: c.name, color: c.color, oldSlug: c.slug });
  }

  // ---------- meetings ----------
  const meetings: MeetingImport[] = [];
  for (const c of cats) {
    if (skippedKinds.has(c.slug)) continue;
    const rows = rowsOf(c.slug);
    const h = (rows[0] ?? []).map(text);
    const own = fields.filter(
      (f) =>
        f.category_slug === c.slug &&
        !['auto_number', 'computed', 'file'].includes(f.type) &&
        f.key !== 'meeting_status',
    );
    rows.slice(1).forEach((r) => {
      const id = text(r[h.indexOf('id')]);
      const date = text(r[h.indexOf('date')]);
      if (!ULID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (text(r[h.indexOf('deleted_at')])) {
        notes.push(`A meeting in the Trash (${c.name}) was left behind.`);
        return;
      }
      const values: Record<string, string> = {};
      for (const f of own) {
        const i = h.indexOf(f.key);
        const v = i >= 0 ? text(r[i]) : '';
        if (v !== '') values[f.key] = v;
      }
      const title = values.topic || values.project_name || values.name_of_project || '';
      if (/^test(ing)?$/i.test(title)) {
        notes.push(
          `The meeting "${title}" on ${date} (${c.name}) was a test, so it was left behind.`,
        );
        return;
      }
      const start = values.start_time ?? '';
      if (/^0[0-5]:\d{2}$/.test(start)) {
        values.start_time = addHours(start, 12);
        if (values.end_time) values.end_time = addHours(values.end_time, 12);
        notes.push(
          `"${title}" on ${date} was saved for ${start} at night, almost certainly a 12-hour clock slip, so it was moved to ${values.start_time}.`,
        );
      }
      const status = text(r[h.indexOf('meeting_status')]);
      if (status === 'Rescheduled')
        notes.push(`"${title}" (${date}) was marked Rescheduled; it is copied as Scheduled.`);
      if (status === 'Completed' || status === 'Cancelled')
        notes.push(
          `"${title}" (${date}) was ${status}; it is copied as Scheduled and needs marking again.`,
        );
      meetings.push({ id, category: c.slug, values, title });
    });
  }

  // ---------- the award-plan table pasted into the AT tab ----------
  const lists: ListImport[] = [];
  const at = rowsOf('at');
  const ah = (at[0] ?? []).map(text);
  const col = (name: string) => ah.findIndex((x) => x.toLowerCase() === name.toLowerCase());
  const [pName, pMode, pBdd, pNew, pRemarks] = [
    col('Project Name'),
    col('Mode'),
    col('BDD'),
    col('New BDD'),
    col('Remarks'),
  ];
  if (pName >= 0) {
    const rows = at
      .slice(1)
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => text(r[pName]) !== '')
      .map(({ r, i }) => {
        const first = dmy(text(r[pBdd]));
        const latest = dmy(text(r[pNew]));
        const remark = text(r[pRemarks]);
        const before = first && latest && first !== latest ? `Original BDD: ${text(r[pBdd])}.` : '';
        return {
          id: stableId(`award:${i}`),
          values: {
            project: text(r[pName]),
            mode: blankish(text(r[pMode])) ? null : text(r[pMode]),
            bdd: latest ?? first,
            remarks: [before, remark].filter(Boolean).join('\n') || null,
          },
        };
      });
    lists.push({ existingSlug: 'award_plan', rows });
    notes.push(
      `${rows.length} projects were pasted into the AT (Award Target) tab, outside the app's columns, so the app never showed them. They go to the Award Plan list, with the new BDD as the bid due date (the first one is kept in Remarks when it changed) and no stage set.`,
    );
  }

  // ---------- conciliation cases pasted under the CCIE meetings ----------
  const cc = rowsOf('ccie');
  const ch = (cc[0] ?? []).map(text);
  const at_ = (r: Cell[], k: string) => text(r[ch.indexOf(k)]);
  const caseRows = cc
    .slice(1)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !ULID.test(at_(r, 'id')) && at_(r, 'case_id') !== '');
  if (caseRows.length > 0) {
    lists.push({
      name: 'CCIE Cases',
      itemName: 'case',
      color: '#1D4ED8',
      starting: {
        name: { label: 'Case Id' },
        status: { label: 'Status', options: [] },
        due_date: { archived: true },
      },
      fields: [
        { key: 'project_name', label: 'Project Name', type: 'text', show_in_table: true },
        {
          key: 'status_of_dispute',
          label: 'Status of Dispute',
          type: 'select',
          allow_new_options: true,
        },
        {
          key: 'allocated_ccie',
          label: 'Allocated CCIE',
          type: 'select',
          allow_new_options: true,
          show_in_table: true,
        },
        {
          key: 'action_to_be_taken_by',
          label: 'Action to be taken by',
          type: 'select',
          allow_new_options: true,
        },
        {
          key: 'status_of_detail_form',
          label: 'Status of Detail Form',
          type: 'select',
          allow_new_options: true,
        },
        { key: 'upc', label: 'UPC', type: 'text' },
        { key: 'piu', label: 'PIU', type: 'select', allow_new_options: true },
        { key: 'ro', label: 'RO', type: 'select', allow_new_options: true },
        { key: 'state', label: 'State', type: 'select', allow_new_options: true },
        { key: 'contractor', label: 'Contractor', type: 'text' },
        { key: 'numbers_of_meeting', label: 'Numbers of Meeting', type: 'number' },
        {
          key: 'date_of_initiation',
          label: 'Date Of Initiation',
          type: 'date',
          show_in_table: true,
        },
        {
          key: 'date_of_final_settlement_agreement',
          label: 'Date of Final Settlement Agreement',
          type: 'date',
        },
      ],
      roles: {
        title_key: 'name',
        status_key: 'status',
        closed_values: ['Conciliation Settled', 'Conciliation Failed', 'Withdrawn by Contractor'],
        due_key: '',
        group_key: 'allocated_ccie',
      },
      rows: caseRows.map(({ r, i }) => {
        const values: Record<string, unknown> = {
          name: at_(r, 'case_id'),
          status: at_(r, 'status') || null,
          project_name: at_(r, 'project_name') || null,
          status_of_dispute: at_(r, 'status_of_dispute') || null,
          allocated_ccie: at_(r, 'allocated_ccie') || null,
          action_to_be_taken_by: at_(r, 'action_to_be_taken_by') || null,
          status_of_detail_form: at_(r, 'status_of_detail_form') || null,
          upc: at_(r, 'upc') || null,
          piu: at_(r, 'piu') || null,
          ro: at_(r, 'ro') || null,
          state: at_(r, 'state') || null,
          contractor: at_(r, 'contractor') || null,
          numbers_of_meeting: num(at_(r, 'numbers_of_meeting')),
          date_of_initiation: dmy(at_(r, 'date_of_initiation')),
          date_of_final_settlement_agreement: dmy(at_(r, 'date_of_final_settlement_agreement')),
        };
        return { id: stableId(`ccie-case:${i}`), values };
      }),
    });
    notes.push(
      `${caseRows.length} conciliation cases were pasted under the CCIE meetings without a meeting date, so the app never showed them. They go to a new "CCIE Cases" list. The pasted "Pendency" (worked out on the day it was pasted) is not copied; the case's dates are.`,
    );
  }

  // ---------- the works table pasted under Others without its headings ----------
  const ot = rowsOf('others');
  const start = ot.findIndex((r) => text(r[0]) === 'Column 1');
  if (start >= 0) {
    const works = ot
      .slice(start + 1)
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !isBlank(r) && /^\d+$/.test(text(r[0])) && text(r[4]) !== '');
    const guess =
      'The pasted sheet had no heading here; this name was worked out from the values. Rename it if it is wrong.';
    const c = (r: Cell[], n: number) => text(r[n - 1]);
    const yes = (s: string) => (/^yes$/i.test(s) ? 'Yes' : /^no$/i.test(s) ? 'No' : null);
    const dateOrNote = (s: string, label: string, extra: string[]) => {
      if (blankish(s)) return null;
      const d = mdy(s);
      if (!d) extra.push(`${label}: ${s}`);
      return d;
    };
    lists.push({
      name: 'NRCW Targets',
      itemName: 'work',
      color: '#B45309',
      starting: {
        name: { label: 'Name of Work' },
        status: { label: 'Awarded', options: ['Not awarded', 'Awarded'] },
        due_date: { label: 'Date of Award (target or actual)' },
        remarks: { label: 'Remarks' },
      },
      fields: [
        { key: 'member', label: 'Member', type: 'select', allow_new_options: true },
        { key: 'ro', label: 'RO', type: 'select', allow_new_options: true, show_in_table: true },
        { key: 'piu', label: 'PIU', type: 'select', allow_new_options: true, show_in_table: true },
        {
          key: 'category_of_work',
          label: 'Category of Work',
          type: 'select',
          allow_new_options: true,
        },
        { key: 'column_7', label: 'Column 7', type: 'text', help_text: guess },
        { key: 'column_8', label: 'Column 8', type: 'text', help_text: guess },
        { key: 'column_9', label: 'Column 9', type: 'text', help_text: guess },
        {
          key: 'length_km',
          label: 'Length',
          type: 'number',
          unit: 'km',
          help_text: guess,
          show_in_table: true,
        },
        {
          key: 'sanctioned',
          label: 'Sanctioned',
          type: 'select',
          options: ['Yes', 'No'],
          help_text: guess,
        },
        {
          key: 'sanction_pending_at',
          label: 'Sanction pending at',
          type: 'select',
          allow_new_options: true,
          help_text: guess,
        },
        {
          key: 'sanction_target_date',
          label: 'Target date of sanction',
          type: 'date',
          help_text: guess,
        },
        { key: 'cost', label: 'Cost', type: 'number', unit: '₹ Cr', help_text: guess },
        {
          key: 'bids_invited',
          label: 'Bids invited',
          type: 'select',
          options: ['Yes', 'No'],
          help_text: guess,
        },
        {
          key: 'bid_invite_target_date',
          label: 'Target date of inviting bids',
          type: 'date',
          help_text: guess,
        },
        { key: 'bid_date', label: 'Bid date', type: 'date', help_text: guess },
        { key: 'bid_status', label: 'Bid status', type: 'text', help_text: guess },
        {
          key: 'awarded_cost',
          label: 'Awarded cost',
          type: 'number',
          unit: '₹ Cr',
          help_text: guess,
        },
        { key: 'upc', label: 'UPC', type: 'text', help_text: guess },
      ],
      roles: {
        title_key: 'name',
        status_key: 'status',
        closed_values: ['Awarded'],
        due_key: 'due_date',
        group_key: 'ro',
        sum_keys: ['length_km'],
      },
      rows: works.map(({ r, i }) => {
        const extra: string[] = [];
        const upc = c(r, 22);
        const values: Record<string, unknown> = {
          name: c(r, 5),
          member: c(r, 2) || null,
          ro: c(r, 3) || null,
          piu: c(r, 4) || null,
          category_of_work: c(r, 6).replace(/,\s*$/, '') || null,
          column_7: c(r, 7) || null,
          column_8: c(r, 8) || null,
          column_9: c(r, 9) || null,
          length_km: num(c(r, 10)),
          sanctioned: yes(c(r, 11)),
          sanction_pending_at: blankish(c(r, 12)) ? null : c(r, 12),
          sanction_target_date: dateOrNote(c(r, 13), 'Target date of sanction', extra),
          cost: num(c(r, 14)),
          bids_invited: yes(c(r, 15)),
          bid_invite_target_date: dateOrNote(c(r, 16), 'Target date of inviting bids', extra),
          bid_date: dateOrNote(c(r, 17), 'Bid date', extra),
          bid_status: blankish(c(r, 18)) ? null : c(r, 18),
          status: yes(c(r, 19)) === 'Yes' ? 'Awarded' : 'Not awarded',
          due_date: dateOrNote(c(r, 20), 'Date of award', extra),
          awarded_cost: num(c(r, 21)),
          upc: /^N\/\d/.test(upc) ? upc : null,
        };
        if (upc && !/^N\/\d/.test(upc) && !blankish(upc) && !/^no$/i.test(upc))
          extra.push(`UPC: ${upc}`);
        for (const [n, key] of [
          [10, 'length_km'],
          [14, 'cost'],
          [21, 'awarded_cost'],
        ] as const) {
          const s = c(r, n);
          if (values[key] === null && !blankish(s)) extra.push(`Column ${n}: ${s}`);
        }
        values.remarks = [c(r, 23), ...extra].filter(Boolean).join('\n') || null;
        return { id: stableId(`nrcw:${i}`), values };
      }),
    });
    notes.push(
      `${works.length} works were pasted under the Others meetings without their headings, so the app never showed them. They go to a new "NRCW Targets" list. The headings were worked out from the values (each says so in its hint) and three could not be worked out ("Column 7", "Column 8", "Column 9"); rename any of them in Admin → Columns. "Awarded" comes from the Yes/No column before the award date. Text that did not fit a date or number column (such as "Approved" or "SR is with PQC") is kept in Remarks.`,
    );
  }

  // Everything else that was in the old database.
  const files = (raw[TAB.files] ?? []).slice(1).filter((r) => !isBlank(r)).length;
  if (files > 0)
    notes.push(
      `${files} attached file record(s) were not copied: the files stay in the previous owner's Google Drive, and the meetings they belonged to were a test or are no longer in the sheet.`,
    );
  const reschedules = (raw[TAB.reschedules] ?? []).slice(1).filter((r) => !isBlank(r)).length;
  if (reschedules > 0)
    notes.push(
      `${reschedules} reschedule record(s) and the change log stay in the previous spreadsheet; the copied meetings start a new history.`,
    );
  if (Object.keys(settings).length > 0)
    notes.push(
      `Settings copied: ${Object.entries(settings)
        .map(([k, v]) => `${k} = ${v}`)
        .join(', ')}.`,
    );
  const kept = new Set([
    ...cats.filter((c) => c.is_seed).map((c) => c.slug),
    ...categories.map((c) => c.oldSlug),
  ]);
  const oldFields = fields.filter((f) => kept.has(f.category_slug));
  return { settings, oldFields, categories, meetings, lists, notes };
}
