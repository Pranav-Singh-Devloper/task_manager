export const TEXT_SIZES = ['100', '125', '150'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export type Contrast = 'normal' | 'high';

/** Per-device UI preferences are kept in localStorage and mirrored in cookies so the server renders them on first paint. */
export const PREF_COOKIE = { textSize: 'mm_text_size', contrast: 'mm_contrast' } as const;
export const PREF_STORAGE = { textSize: 'mm.textSize', contrast: 'mm.contrast' } as const;

export function parseTextSize(value: string | undefined | null): TextSize {
  return (TEXT_SIZES as readonly string[]).includes(value ?? '') ? (value as TextSize) : '100';
}

export function parseContrast(value: string | undefined | null): Contrast {
  return value === 'high' ? 'high' : 'normal';
}
