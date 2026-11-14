import { checkFormula } from '../../shared/formula';
import {
  parseCategories,
  parseFields,
  parseSettings,
  parseWorkspaces,
} from '../../shared/configRows';
import type { CategoryDef, Cell, FieldDef, Settings, WorkspaceDef } from '../../shared/types';
import type { TabInfo } from './google/types';

export interface CategoryConfig {
  category: CategoryDef;
  /** Every field of the category in form order, archived ones included (their data stays in the Sheet). */
  fields: FieldDef[];
  tab: { gid: number; title: string };
}

export interface Config {
  categories: CategoryDef[];
  fields: FieldDef[];
  workspaces: WorkspaceDef[];
  settings: Settings;
  byCategory: Map<string, CategoryConfig>;
  /** Config rows that were skipped or adjusted, in plain words. Shown in Admin, System health. */
  problems: string[];
}

export interface ConfigRows {
  categories: Cell[][];
  fields: Cell[][];
  workspaces: Cell[][];
  settings: Cell[][];
}

/** A category cannot work without these (§6.5: they cannot be hidden). */
const MUST_HAVE = ['date', 'start_time', 'meeting_status', 'workspace'];
const KEY_FORMAT = /^[a-z][a-z0-9_]*$/;

/**
 * Turns the config tabs into a validated config. The owner can edit these tabs by hand in Sheets, so every row is checked:
 * a bad one is skipped and reported, and never stops the app (§6.3).
 */
export function buildConfig(rows: ConfigRows, tabs: TabInfo[]): Config {
  const problems: string[] = [];
  const workspaces = parseWorkspaces(rows.workspaces).items;
  const settings = parseSettings(rows.settings);
  const cats = parseCategories(rows.categories);
  const fieldsParsed = parseFields(rows.fields);
  problems.push(...cats.problems, ...fieldsParsed.problems);

  const workspaceSlugs = new Set(workspaces.map((w) => w.slug));
  const tabByGid = new Map(tabs.map((t) => [t.gid, t]));

  // Categories: each must point at a tab that exists.
  const validCategories: CategoryDef[] = [];
  for (const c of cats.items) {
    if (c.sheet_gid === null || !tabByGid.has(c.sheet_gid)) {
      problems.push(
        `The category "${c.name}" points to a tab that no longer exists, so it is hidden.`,
      );
      continue;
    }
    if (workspaces.length > 0 && !workspaceSlugs.has(c.default_workspace)) {
      problems.push(
        `The category "${c.name}" has an unknown default workspace, so "${workspaces[0]?.name}" is used.`,
      );
      validCategories.push({ ...c, default_workspace: (workspaces[0] as WorkspaceDef).slug });
    } else {
      validCategories.push(c);
    }
  }
  const slugs = new Set(validCategories.map((c) => c.slug));

  // Fields: keep what is valid, report the rest.
  const kept: FieldDef[] = [];
  for (const f of fieldsParsed.items) {
    if (!slugs.has(f.category_slug)) {
      // A field of a hidden or missing category is not an error worth reporting twice.
      if (!cats.items.some((c) => c.slug === f.category_slug)) {
        problems.push(
          `The column "${f.label}" belongs to the category "${f.category_slug}", which does not exist, so it was skipped.`,
        );
      }
      continue;
    }
    if (!KEY_FORMAT.test(f.key)) {
      problems.push(
        `The column "${f.label}" has a key "${f.key}" that is not allowed (use lower-case letters, numbers and underscores), so it was skipped.`,
      );
      continue;
    }
    kept.push(f);
  }

  // Formulas can only use stored columns of the same category.
  const storedKeys = new Map<string, Set<string>>();
  for (const f of kept) {
    if (f.type !== 'computed') {
      const set = storedKeys.get(f.category_slug) ?? new Set<string>();
      set.add(f.key);
      storedKeys.set(f.category_slug, set);
    }
  }
  const fields: FieldDef[] = [];
  for (const f of kept) {
    if (f.type === 'computed') {
      if (!f.computed_expr) {
        problems.push(`The calculated column "${f.label}" has no formula, so it was skipped.`);
        continue;
      }
      const problem = checkFormula(f.computed_expr, storedKeys.get(f.category_slug) ?? new Set());
      if (problem) {
        problems.push(
          `The formula for "${f.label}" (${f.category_slug}) does not work: ${problem} It was skipped.`,
        );
        continue;
      }
    }
    fields.push(f);
  }

  // Categories need their core columns, and a title template should only use columns that exist.
  const byCategory = new Map<string, CategoryConfig>();
  const usable: CategoryDef[] = [];
  for (const c of validCategories) {
    const own = fields.filter((f) => f.category_slug === c.slug).sort((a, b) => a.order - b.order);
    const missing = MUST_HAVE.filter((k) => !own.some((f) => f.key === k));
    if (missing.length > 0) {
      problems.push(
        `The category "${c.name}" is missing the required column(s) ${missing.join(', ')}, so it is hidden.`,
      );
      continue;
    }
    const known = new Set(own.map((f) => f.key));
    for (const m of c.title_template.matchAll(/\{(\w+)\}/g)) {
      if (!known.has(m[1] as string)) {
        problems.push(
          `The title template of "${c.name}" uses "${m[1]}", which is not one of its columns.`,
        );
      }
    }
    const tab = tabByGid.get(c.sheet_gid as number) as TabInfo;
    byCategory.set(c.slug, { category: c, fields: own, tab: { gid: tab.gid, title: tab.title } });
    usable.push(c);
  }

  return {
    categories: usable,
    fields: fields.filter((f) => byCategory.has(f.category_slug)),
    workspaces,
    settings,
    byCategory,
    problems,
  };
}
