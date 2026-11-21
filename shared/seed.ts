import { DEFAULT_SETTINGS } from './schema';
import type { CategoryDef, FieldDef, FieldType, Settings, WorkspaceDef } from './types';

export const CATEGORY_PALETTE = [
  '#1D4ED8',
  '#047857',
  '#B45309',
  '#BE123C',
  '#6D28D9',
  '#0E7490',
  '#C2410C',
  '#4D7C0F',
  '#A21CAF',
  '#334155',
] as const;

export const SEED_WORKSPACES: WorkspaceDef[] = [
  { slug: 'nhai', name: 'NHAI', color: '#1E40AF', sort: 1 },
  { slug: 'phd', name: 'PhD', color: '#6D28D9', sort: 2 },
  { slug: 'personal', name: 'Personal', color: '#047857', sort: 3 },
];

interface SeedCategory {
  slug: string;
  name: string;
  tabTitle: string;
  workspace: string;
  titleTemplate: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'ccie',
    name: 'CCIE',
    tabTitle: 'CCIE',
    workspace: 'nhai',
    titleTemplate: 'CCIE — {project_name} ({case_id})',
  },
  {
    slug: 'sfc_pppac',
    name: 'SFC/PPPAC',
    tabTitle: 'SFC_PPPAC',
    workspace: 'nhai',
    titleTemplate: '',
  },
  { slug: 'morth', name: 'MORTH', tabTitle: 'MORTH', workspace: 'nhai', titleTemplate: '' },
  { slug: 'pmg', name: 'PMG', tabTitle: 'PMG', workspace: 'nhai', titleTemplate: '' },
  {
    slug: 'patsc_iac',
    name: 'PATSC/IAC',
    tabTitle: 'PATSC_IAC',
    workspace: 'nhai',
    titleTemplate: '',
  },
  {
    slug: 'file_discussion',
    name: 'File Discussion',
    tabTitle: 'File Discussion',
    workspace: 'nhai',
    titleTemplate: '',
  },
  {
    slug: 'at',
    name: 'AT (Award Target)',
    tabTitle: 'AT',
    workspace: 'nhai',
    titleTemplate: 'AT — {name_of_project}',
  },
  {
    slug: 'court_case',
    name: 'Court Case',
    tabTitle: 'Court Case',
    workspace: 'nhai',
    titleTemplate: '',
  },
  { slug: 'others', name: 'Others', tabTitle: 'Others', workspace: 'nhai', titleTemplate: '' },
  // [Assumed] PhD categories; the owner can archive them.
  {
    slug: 'supervisor_meeting',
    name: 'Supervisor Meeting',
    tabTitle: 'Supervisor Meeting',
    workspace: 'phd',
    titleTemplate: '',
  },
  {
    slug: 'phd_milestone',
    name: 'PhD Milestone / Deadline',
    tabTitle: 'PhD Milestone',
    workspace: 'phd',
    titleTemplate: '',
  },
];

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

export type FieldSpec = Partial<FieldDef> & Pick<FieldDef, 'key' | 'label' | 'type'>;

export function makeField(
  slug: string,
  order: number,
  createdAt: string,
  spec: FieldSpec,
): FieldDef {
  const searchable = !['checkbox', 'file', 'auto_number'].includes(spec.type);
  return {
    category_slug: slug,
    required: false,
    options: [],
    allow_new_options: false,
    default_value: '',
    help_text: '',
    placeholder: '',
    unit: '',
    order,
    show_in_form: true,
    show_in_table: false,
    searchable,
    case_key: false,
    computed_expr: '',
    locked: false,
    archived: false,
    created_at: createdAt,
    ...spec,
  };
}

/** Core fields every category has (§6.5). Orders leave room for category fields between them. */
export function coreFields(slug: string, hasTemplate: boolean, createdAt: string): FieldDef[] {
  const core: [number, FieldSpec][] = [
    [
      10,
      { key: 'sr_no', label: 'Sr. No.', type: 'auto_number', locked: true, show_in_form: false },
    ],
    [
      20,
      {
        key: 'date',
        label: 'Date',
        type: 'date',
        required: true,
        locked: true,
        show_in_table: true,
      },
    ],
    [
      30,
      {
        key: 'start_time',
        label: 'Time',
        type: 'time',
        required: true,
        locked: true,
        show_in_table: true,
      },
    ],
    [40, { key: 'end_time', label: 'End time', type: 'time', locked: true }],
    [
      50,
      {
        key: 'topic',
        label: 'Topic',
        type: 'text',
        required: !hasTemplate,
        locked: true,
        show_in_table: true,
      },
    ],
    [
      800,
      {
        key: 'meeting_status',
        label: 'Status',
        type: 'select',
        options: ['Scheduled', 'Rescheduled', 'Completed', 'Cancelled'],
        default_value: 'Scheduled',
        locked: true,
        show_in_form: false,
        show_in_table: true,
      },
    ],
    [
      810,
      {
        key: 'meeting_link',
        label: 'Meeting Link',
        type: 'url',
        locked: true,
        show_in_table: true,
      },
    ],
    [820, { key: 'files', label: 'File', type: 'file', locked: true, show_in_table: true }],
    [830, { key: 'remarks', label: 'Remarks', type: 'text', locked: true }],
    [840, { key: 'details', label: 'Details', type: 'long_text', locked: true }],
    [850, { key: 'workspace', label: 'Workspace', type: 'select', locked: true }],
    [
      860,
      {
        key: 'reminder_minutes',
        label: 'Reminders',
        type: 'text',
        help_text: 'Minutes before the meeting, comma separated. Leave blank for the default.',
        locked: true,
      },
    ],
  ];
  return core.map(([order, spec]) => makeField(slug, order, createdAt, spec));
}

function ccieFields(createdAt: string): FieldDef[] {
  const specs: FieldSpec[] = [
    { key: 'action_to_be_taken_by', label: 'Action to be taken by', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', allow_new_options: true },
    {
      key: 'case_id',
      label: 'Case Id',
      type: 'text',
      required: true,
      case_key: true,
      show_in_table: true,
    },
    {
      key: 'status_of_dispute',
      label: 'Status of Dispute',
      type: 'select',
      allow_new_options: true,
    },
    {
      key: 'status_of_detail_form',
      label: 'Status of Detail Form',
      type: 'select',
      allow_new_options: true,
    },
    { key: 'allocated_ccie', label: 'Allocated CCIE', type: 'select', allow_new_options: true },
    {
      key: 'project_name',
      label: 'Project Name',
      type: 'text',
      required: true,
      show_in_table: true,
    },
    { key: 'upc', label: 'UPC', type: 'text' },
    { key: 'piu', label: 'PIU', type: 'select', allow_new_options: true },
    { key: 'ro', label: 'RO', type: 'select', allow_new_options: true },
    { key: 'state', label: 'State', type: 'select', options: INDIAN_STATES_AND_UTS },
    { key: 'contractor', label: 'Contractor', type: 'select', allow_new_options: true },
    {
      key: 'numbers_of_meeting',
      label: 'Numbers of Meeting',
      type: 'computed',
      computed_expr: 'count_same(case_id)',
      show_in_table: true,
    },
    {
      key: 'date_of_final_settlement_agreement',
      label: 'Date of Final Settlement Agreement',
      type: 'date',
    },
    { key: 'date_of_initiation', label: 'Date Of Initiation', type: 'date' },
    {
      key: 'pendency_months',
      label: 'Pendency (In Months)',
      type: 'computed',
      computed_expr:
        'months_between(date_of_initiation, coalesce(date_of_final_settlement_agreement, today()))',
      show_in_table: true,
    },
  ];
  return specs.map((s, i) => makeField('ccie', 100 + i * 10, createdAt, s));
}

function atFields(createdAt: string): FieldDef[] {
  const specs: FieldSpec[] = [
    {
      key: 'name_of_project',
      label: 'Name of Project',
      type: 'text',
      required: true,
      show_in_table: true,
    },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: ['EPC', 'HAM', 'BOT'],
      allow_new_options: true,
      show_in_table: true,
    },
    { key: 'length', label: 'Length', type: 'number', unit: 'km' },
    { key: 'civil_cost', label: 'Civil Cost', type: 'number', unit: '₹ Cr' },
    { key: 'total_cost', label: 'Total Cost', type: 'number', unit: '₹ Cr', show_in_table: true },
    { key: 'bid_due_date', label: 'Bid Due Date (BDD)', type: 'date' },
    { key: 'ae_ie', label: 'AE/IE', type: 'select', allow_new_options: true },
  ];
  return specs.map((s, i) => makeField('at', 100 + i * 10, createdAt, s));
}

export interface SeedConfig {
  workspaces: WorkspaceDef[];
  categories: CategoryDef[];
  fields: FieldDef[];
  settings: Settings;
  /** Sheet tab title for each category slug. */
  tabTitles: Record<string, string>;
}

/** Builds the config that a fresh database is seeded with (§6.7). `sheet_gid` is filled in once tabs exist. */
export function buildSeedConfig(createdAt: string): SeedConfig {
  const categories: CategoryDef[] = SEED_CATEGORIES.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] as string,
    sort: i + 1,
    active: true,
    default_workspace: c.workspace,
    title_template: c.titleTemplate,
    sheet_gid: null,
    is_seed: true,
    created_at: createdAt,
  }));

  const fields: FieldDef[] = [];
  for (const c of SEED_CATEGORIES) {
    const extra =
      c.slug === 'ccie' ? ccieFields(createdAt) : c.slug === 'at' ? atFields(createdAt) : [];
    fields.push(...coreFields(c.slug, c.titleTemplate !== '', createdAt), ...extra);
  }

  const tabTitles = Object.fromEntries(SEED_CATEGORIES.map((c) => [c.slug, c.tabTitle]));
  return {
    workspaces: SEED_WORKSPACES,
    categories,
    fields,
    settings: { ...DEFAULT_SETTINGS },
    tabTitles,
  };
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  time: 'Time',
  select: 'Choose one',
  multi_select: 'Choose many',
  checkbox: 'Yes / No',
  url: 'Web link',
  file: 'File',
  auto_number: 'Automatic number',
  computed: 'Calculated',
  stages: 'States with dates',
};
