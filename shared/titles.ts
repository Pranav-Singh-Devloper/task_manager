/**
 * Renders a category title template such as "CCIE — {project_name} ({case_id})".
 * Missing parts are dropped cleanly: a bracketed group with an empty placeholder disappears,
 * and dangling separators at the ends are trimmed.
 */
export function renderTitle(template: string, values: Record<string, unknown>): string {
  const val = (key: string): string => {
    const v = values[key];
    return v === null || v === undefined ? '' : String(v).trim();
  };

  let out = template.replace(/\s*\(([^()]*)\)/g, (whole, inner: string) => {
    const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
    return keys.length > 0 && keys.some((k) => !val(k)) ? '' : whole;
  });
  out = out.replace(/\{(\w+)\}/g, (_, key: string) => val(key));
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s—–\-:,]+|[\s—–\-:,]+$/g, '')
    .trim();
}
