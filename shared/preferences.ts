/**
 * A−− / A− / A: 60%, 70% and 80% of the original 18 px text. The owner asked for A to be what used to be the smallest
 * size, with two smaller ones below it and none larger (2026-11-22).
 */
export const TEXT_SIZES = ['60', '70', '80'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = '80';
export type Contrast = 'normal' | 'high';
/** Animated text, backgrounds and hover effects. Off also when the device asks for reduced motion. */
export type Motion = 'on' | 'off';

/** Per-device UI preferences are kept in localStorage and mirrored in cookies so the server renders them on first paint. */
export const PREF_COOKIE = {
  textSize: 'mm_text_size',
  contrast: 'mm_contrast',
  motion: 'mm_motion',
} as const;
export const PREF_STORAGE = {
  textSize: 'mm.textSize',
  contrast: 'mm.contrast',
  motion: 'mm.motion',
} as const;

export function parseTextSize(value: string | undefined | null): TextSize {
  return (TEXT_SIZES as readonly string[]).includes(value ?? '')
    ? (value as TextSize)
    : DEFAULT_TEXT_SIZE;
}

export function parseContrast(value: string | undefined | null): Contrast {
  return value === 'high' ? 'high' : 'normal';
}

export function parseMotion(value: string | undefined | null): Motion {
  return value === 'off' ? 'off' : 'on';
}
