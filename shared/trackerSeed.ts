import { CATEGORY_PALETTE, makeField, type FieldSpec } from './seed';
import type { FieldDef, TrackerDef, TrackerKind, TrackerRoles } from './types';

/**
 * The trackers a database starts with, besides meetings (§ Trackers in DECISIONS.md). Each is a tab of its own with
 * columns that can be changed in Admin. Column names follow the owner's own spreadsheets. No real data is kept here:
 * the repository is public.
 */

interface SeedTracker {
  slug: string;
  name: string;
  itemName: string;
  kind: TrackerKind;
  tabTitle: string;
  color: string;
  roles: Partial<TrackerRoles>;
  /** On Google Calendar by default: the owner wants discussion dates and bid due dates there. */
  calendar?: boolean;
  fields: FieldSpec[];
}

const SR_NO: FieldSpec = {
  key: 'sr_no',
  label: 'Sl No',
  type: 'auto_number',
  locked: true,
  show_in_form: false,
};
const REMARKS: FieldSpec = { key: 'remarks', label: 'Remarks', type: 'long_text' };

export const SEED_TRACKERS: SeedTracker[] = [
  {
    slug: 'award_plan',
    name: 'Award Plan',
    itemName: 'project',
    kind: 'award',
    tabTitle: 'Award Plan',
    calendar: true,
    color: CATEGORY_PALETTE[2],
    roles: {
      title_key: 'project',
      status_key: 'stage',
      closed_values: ['Awarded'],
      due_key: 'bdd',
      group_key: 'mode',
      sum_keys: ['length_km', 'total_cost'],
      done_date_key: 'awarded_on',
      stage_key: 'stage',
    },
    fields: [
      SR_NO,
      { key: 'project', label: 'Name of Project', type: 'text', required: true, locked: true },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        options: ['HAM', 'EPC', 'BOT'],
        allow_new_options: true,
        show_in_table: true,
      },
      { key: 'length_km', label: 'Length', type: 'number', unit: 'km', show_in_table: true },
      { key: 'civil_cost', label: 'Civil Cost', type: 'number', unit: '₹ Cr' },
      { key: 'total_cost', label: 'Total Cost', type: 'number', unit: '₹ Cr', show_in_table: true },
      { key: 'bdd', label: 'BDD (Bid Due Date)', type: 'date', show_in_table: true },
      { key: 'ae_ie', label: 'AE/IE', type: 'text' },
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        options: [
          'Gazette notification',
          'Bids invited',
          'Bids received',
          'Under evaluation',
          'LoA issued',
          'Awarded',
        ],
        allow_new_options: true,
        default_value: 'Gazette notification',
        show_in_table: true,
      },
      {
        key: 'awarded_on',
        label: 'Awarded on',
        type: 'date',
        help_text: 'Counts towards this year’s award target.',
      },
      REMARKS,
    ],
  },
  {
    slug: 'discussions',
    name: 'Discussions',
    itemName: 'discussion',
    kind: 'discussion',
    tabTitle: 'Discussions',
    calendar: true,
    color: CATEGORY_PALETTE[0],
    roles: {
      title_key: 'topic',
      status_key: 'status',
      closed_values: ['Done'],
      due_key: 'date',
      group_key: 'discussion_with',
    },
    fields: [
      SR_NO,
      {
        key: 'discussion_with',
        label: 'Discussion with',
        type: 'select',
        options: ['Member(T)'],
        allow_new_options: true,
        required: true,
        show_in_table: true,
      },
      { key: 'topic', label: 'Topic', type: 'text', required: true, locked: true },
      { key: 'date', label: 'Date', type: 'date', show_in_table: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Pending', 'Done'],
        default_value: 'Pending',
        show_in_table: true,
      },
      { key: 'outcome', label: 'Outcome', type: 'long_text' },
      REMARKS,
    ],
  },
  {
    slug: 'dpr',
    name: 'DPR',
    itemName: 'DPR',
    kind: 'dpr',
    tabTitle: 'DPR',
    color: CATEGORY_PALETTE[5],
    roles: {
      title_key: 'project',
      status_key: 'status',
      closed_values: ['Completed', 'Pre-closed'],
      due_key: 'completion_date',
      group_key: 'consultant',
      sum_keys: ['length_km'],
      stage_key: 'stage',
    },
    fields: [
      SR_NO,
      { key: 'project', label: 'Name of Project', type: 'text', required: true, locked: true },
      {
        key: 'consultant',
        label: 'Consultant',
        type: 'select',
        allow_new_options: true,
        show_in_table: true,
      },
      { key: 'piu', label: 'PIU', type: 'select', allow_new_options: true },
      { key: 'ro', label: 'RO', type: 'select', allow_new_options: true },
      { key: 'state', label: 'State', type: 'select', allow_new_options: true },
      { key: 'length_km', label: 'Length', type: 'number', unit: 'km' },
      { key: 'cost', label: 'Cost', type: 'number', unit: '₹ Cr' },
      { key: 'agreement_date', label: 'Date of Agreement', type: 'date' },
      { key: 'start_date', label: 'Sch. Date of Start', type: 'date' },
      {
        key: 'completion_date',
        label: 'Sch. Date of Completion',
        type: 'date',
        show_in_table: true,
      },
      {
        key: 'stage',
        label: 'Present stage',
        type: 'select',
        options: [
          'Inception',
          'Alignment',
          'Feasibility',
          'Draft DPR',
          'Final DPR',
          'Appraisal',
          'Bid document',
        ],
        allow_new_options: true,
        show_in_table: true,
      },
      {
        key: 'status',
        label: 'Overall status',
        type: 'select',
        options: ['In progress', 'Completed', 'On hold', 'Pre-closed'],
        allow_new_options: true,
        default_value: 'In progress',
        show_in_table: true,
      },
      { key: 'billed_amount', label: 'Total Billing Amount', type: 'number', unit: '₹' },
      { key: 'pending_amount', label: 'Total Pending Amount', type: 'number', unit: '₹' },
      { key: 'consultancy_cost', label: 'Consultancy Cost', type: 'number', unit: '₹ Cr' },
      { key: 'civil_cost', label: 'Civil Cost', type: 'number', unit: '₹ Cr' },
      REMARKS,
    ],
  },
  {
    slug: 'track',
    name: 'Track',
    itemName: 'event',
    kind: 'track',
    tabTitle: 'Track',
    color: CATEGORY_PALETTE[4],
    roles: {
      title_key: 'event',
      status_key: 'status',
      closed_values: ['Closed'],
      stages_key: 'states',
    },
    fields: [
      SR_NO,
      { key: 'event', label: 'Event', type: 'text', required: true, locked: true },
      {
        key: 'states',
        label: 'States',
        type: 'stages',
        help_text: 'List the states this event goes through, and the date each one was reached.',
        show_in_table: true,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Active', 'Closed'],
        default_value: 'Active',
        show_in_table: true,
      },
      REMARKS,
    ],
  },
  {
    slug: 'under_observation',
    name: 'Under Observation',
    itemName: 'item',
    kind: 'observation',
    tabTitle: 'Under Observation',
    color: CATEGORY_PALETTE[3],
    roles: {
      title_key: 'work',
      status_key: 'status',
      closed_values: ['Closed'],
      due_key: 'target_date',
      group_key: 'status',
    },
    fields: [
      SR_NO,
      { key: 'work', label: 'Project/work', type: 'text', required: true, locked: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['On track', 'At risk', 'Delayed', 'Closed'],
        allow_new_options: true,
        default_value: 'On track',
        show_in_table: true,
      },
      { key: 'target_date', label: 'Target Date', type: 'date', show_in_table: true },
      { key: 'remarks_1', label: 'Remarks 1', type: 'long_text' },
      { key: 'remarks_2', label: 'Remarks 2', type: 'long_text' },
    ],
  },
];

export const EMPTY_ROLES: TrackerRoles = {
  title_key: '',
  short_key: '',
  status_key: '',
  closed_values: [],
  due_key: '',
  group_key: '',
  sum_keys: [],
  done_date_key: '',
  stages_key: '',
  stage_key: '',
};

/** Fills in the roles a tracker did not set. */
export function fullRoles(partial: Partial<TrackerRoles> | undefined): TrackerRoles {
  return { ...EMPTY_ROLES, ...(partial ?? {}) };
}

export interface SeedTrackerConfig {
  tracker: TrackerDef;
  fields: FieldDef[];
  tabTitle: string;
}

/** The starting trackers with their columns. `sheet_gid` is filled in once the tabs exist. */
export function buildSeedTrackers(createdAt: string, startSort = 1): SeedTrackerConfig[] {
  return SEED_TRACKERS.map((s, i) => ({
    tracker: {
      slug: s.slug,
      name: s.name,
      item_name: s.itemName,
      kind: s.kind,
      color: s.color,
      sort: startSort + i,
      active: true,
      sheet_gid: null,
      settings: {
        roles: fullRoles(s.roles),
        targets: { km: null, cr: null },
        calendar: Boolean(s.calendar),
      },
      is_seed: true,
      created_at: createdAt,
    },
    fields: s.fields.map((f, j) => makeField(s.slug, (j + 1) * 10, createdAt, f)),
    tabTitle: s.tabTitle,
  }));
}
