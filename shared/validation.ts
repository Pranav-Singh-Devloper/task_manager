import { z } from 'zod';
import { parseDateLoose, parseTimeLoose } from './dates';
import { MEETING_STATUSES, type FieldDef, type FieldValue, type ValidationIssue } from './types';

/**
 * Validation built from the field config at runtime (§4.1). Add or change a field in the config and the
 * rules change with it: nothing here is written per category.
 */

const isBlank = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** Fields the person never types: filled by the app or managed elsewhere. */
export const NOT_EDITABLE = new Set(['auto_number', 'computed', 'file']);

export interface ValidateOptions {
  /** Workspace slugs a meeting may belong to. */
  workspaces: string[];
  /** The values the row has now. An unchanged value is never re-judged against the current options. */
  existing?: Record<string, FieldValue>;
  /** Use the category's title template instead of requiring a topic. */
  hasTitleTemplate?: boolean;
}

const need = (f: FieldDef) =>
  `Please ${f.type === 'select' || f.type === 'multi_select' ? 'choose' : 'fill in'} ${f.label}.`;

function canonicalOption(
  f: FieldDef,
  value: string,
  existing: unknown,
): string | { error: string } {
  const text = value.trim();
  if (text.length > 200)
    return { error: `${f.label} is too long. Please keep it under 200 characters.` };
  if (f.allow_new_options || f.options.length === 0) return text;
  const match = f.options.find((o) => o.toLowerCase() === text.toLowerCase());
  if (match) return match;
  if (existing !== undefined && existing === text) return text; // an older value that is no longer on the list
  return { error: `${f.label}: "${text}" is not one of the choices.` };
}

function fieldSchema(f: FieldDef, o: ValidateOptions): z.ZodType<FieldValue> {
  const existing = o.existing?.[f.key];
  const required = f.required;
  const missing = required ? need(f) : null;

  const wrap = (parse: (v: unknown, ctx: z.RefinementCtx) => FieldValue): z.ZodType<FieldValue> =>
    z.unknown().transform((v, ctx) => {
      if (isBlank(v)) {
        if (missing) ctx.addIssue({ code: 'custom', message: missing });
        return null;
      }
      return parse(v, ctx);
    }) as unknown as z.ZodType<FieldValue>;

  switch (f.type) {
    case 'text':
    case 'long_text': {
      const max = f.type === 'text' ? 1000 : 40000;
      return wrap((v, ctx) => {
        const text = String(v).trim();
        if (text.length > max) {
          ctx.addIssue({
            code: 'custom',
            message: `${f.label} is too long. Please keep it under ${max.toLocaleString('en-IN')} characters.`,
          });
          return null;
        }
        return text;
      });
    }
    case 'number':
      return wrap((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
        if (!Number.isFinite(n)) {
          ctx.addIssue({ code: 'custom', message: `Please enter a number for ${f.label}.` });
          return null;
        }
        return n;
      });
    case 'date':
      return wrap((v, ctx) => {
        const d = parseDateLoose(v);
        if (!d)
          ctx.addIssue({ code: 'custom', message: `Please choose a valid date for ${f.label}.` });
        return d;
      });
    case 'time':
      return wrap((v, ctx) => {
        const t = parseTimeLoose(v);
        if (!t)
          ctx.addIssue({ code: 'custom', message: `Please choose a valid time for ${f.label}.` });
        return t;
      });
    case 'select':
      return wrap((v, ctx) => {
        const text = String(v).trim();
        if (f.key === 'meeting_status') {
          if (!(MEETING_STATUSES as readonly string[]).includes(text)) {
            ctx.addIssue({ code: 'custom', message: 'Please choose a valid status.' });
            return null;
          }
          return text;
        }
        if (f.key === 'workspace') {
          if (!o.workspaces.includes(text)) {
            ctx.addIssue({ code: 'custom', message: 'Please choose a workspace from the list.' });
            return null;
          }
          return text;
        }
        const r = canonicalOption(f, text, existing);
        if (typeof r === 'string') return r;
        ctx.addIssue({ code: 'custom', message: r.error });
        return null;
      });
    case 'multi_select':
      return wrap((v, ctx) => {
        const parts = Array.isArray(v) ? v.map(String) : String(v).split(',');
        const out: string[] = [];
        for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
          const r = canonicalOption(
            f,
            part,
            Array.isArray(existing) ? (existing.includes(part) ? part : undefined) : undefined,
          );
          if (typeof r !== 'string') {
            ctx.addIssue({ code: 'custom', message: r.error });
            return null;
          }
          if (!out.includes(r)) out.push(r);
        }
        return out;
      });
    case 'checkbox':
      return z.unknown().transform((v, ctx) => {
        if (typeof v === 'boolean') return v;
        if (isBlank(v)) return false;
        const s = String(v).trim().toLowerCase();
        if (['true', 'yes', 'y', '1'].includes(s)) return true;
        if (['false', 'no', 'n', '0'].includes(s)) return false;
        ctx.addIssue({ code: 'custom', message: `Please choose Yes or No for ${f.label}.` });
        return false;
      }) as unknown as z.ZodType<FieldValue>;
    case 'url':
      return wrap((v, ctx) => {
        const text = String(v).trim();
        try {
          const u = new URL(text);
          if ((u.protocol === 'http:' || u.protocol === 'https:') && text.length <= 2000)
            return text;
        } catch {
          // fall through to the message
        }
        ctx.addIssue({
          code: 'custom',
          message: `Please enter a web link for ${f.label}, starting with https://`,
        });
        return null;
      });
    default:
      return z.unknown() as z.ZodType<FieldValue>;
  }
}

/** The Zod object for a category: one rule per editable, active field. */
export function buildSchema(fields: FieldDef[], options: ValidateOptions) {
  const shape: Record<string, z.ZodType<FieldValue>> = {};
  for (const f of fields) {
    if (f.archived || NOT_EDITABLE.has(f.type)) continue;
    const effective: FieldDef =
      f.key === 'topic' && options.hasTitleTemplate ? { ...f, required: false } : f;
    shape[f.key] = fieldSchema(effective, options);
  }
  return z.object(shape).superRefine((values, ctx) => {
    const start = values.start_time;
    const end = values.end_time;
    if (typeof start === 'string' && typeof end === 'string' && end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_time'],
        message: 'The end time must be after the start time.',
      });
    }
  });
}

export type ValidationResult =
  { ok: true; values: Record<string, FieldValue> } | { ok: false; issues: ValidationIssue[] };

/** Checks a complete set of values against the category's fields. Unknown or archived keys are ignored. */
export function validateValues(
  fields: FieldDef[],
  input: Record<string, unknown>,
  options: ValidateOptions,
): ValidationResult {
  // A missing key and a blank value mean the same thing, so every editable field is passed explicitly.
  const prepared: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.archived && !NOT_EDITABLE.has(f.type)) prepared[f.key] = input[f.key] ?? null;
  }
  const parsed = buildSchema(fields, options).safeParse(prepared);
  if (parsed.success) {
    const values: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(parsed.data)) values[k] = v as FieldValue;
    return { ok: true, values };
  }
  const order = new Map(fields.map((f, i) => [f.key, f.order * 1000 + i]));
  const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
    field: String(i.path[0] ?? 'form'),
    message: i.message,
  }));
  issues.sort((a, b) => (order.get(a.field) ?? 0) - (order.get(b.field) ?? 0));
  return { ok: false, issues };
}

/** Required fields that are empty on a saved row: it gets an "Incomplete" chip, and is not blocked (§9 rule 14). */
export function missingRequired(
  fields: FieldDef[],
  values: Record<string, FieldValue>,
  hasTitleTemplate = false,
): string[] {
  return fields
    .filter(
      (f) =>
        f.required &&
        !f.archived &&
        !NOT_EDITABLE.has(f.type) &&
        !(f.key === 'topic' && hasTitleTemplate),
    )
    .filter((f) => isBlank(values[f.key]))
    .map((f) => f.key);
}
