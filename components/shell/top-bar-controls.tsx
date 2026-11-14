'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { TextSize } from '@/shared/preferences';
import { usePreferences } from '../preferences';

const SIZES: {
  value: TextSize;
  short: 'sizeNormal' | 'sizeLarge' | 'sizeLargest';
  long: 'textSizeNormal' | 'textSizeLarge' | 'textSizeLargest';
}[] = [
  { value: '100', short: 'sizeNormal', long: 'textSizeNormal' },
  { value: '125', short: 'sizeLarge', long: 'textSizeLarge' },
  { value: '150', short: 'sizeLargest', long: 'textSizeLargest' },
];

const toggleClasses = (on: boolean) =>
  clsx(
    'inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-lg border-ui px-3 text-base font-semibold',
    on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink',
  );

/** A / A+ / A++ and the High contrast switch. Both are remembered on this device. */
export function TopBarControls() {
  const t = useTranslations('topbar');
  const { textSize, setTextSize, contrast, setContrast } = usePreferences();
  const high = contrast === 'high';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t('textSize')} className="flex gap-2">
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={textSize === s.value}
            onClick={() => setTextSize(s.value)}
            className={toggleClasses(textSize === s.value)}
          >
            {t(s.short)}
            <span className="sr-only">{t(s.long)}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={high}
        onClick={() => setContrast(high ? 'normal' : 'high')}
        className={toggleClasses(high)}
      >
        {t('highContrast')}
        <span aria-hidden="true">{high ? t('on') : t('off')}</span>
      </button>
    </div>
  );
}
