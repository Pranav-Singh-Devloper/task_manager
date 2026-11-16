'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import type { TextSize } from '@/shared/preferences';
import { usePreferences } from '../preferences';

const SIZES: {
  value: TextSize;
  short: 'sizeSmallest' | 'sizeSmaller' | 'sizeNormal' | 'sizeLarge' | 'sizeLargest';
  long:
    'textSizeSmallest' | 'textSizeSmaller' | 'textSizeNormal' | 'textSizeLarge' | 'textSizeLargest';
}[] = [
  { value: '80', short: 'sizeSmallest', long: 'textSizeSmallest' },
  { value: '90', short: 'sizeSmaller', long: 'textSizeSmaller' },
  { value: '100', short: 'sizeNormal', long: 'textSizeNormal' },
  { value: '125', short: 'sizeLarge', long: 'textSizeLarge' },
  { value: '150', short: 'sizeLargest', long: 'textSizeLargest' },
];

const toggleClasses = (on: boolean) =>
  clsx(
    'lift inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-xl border-ui px-3 text-base font-semibold',
    on
      ? 'btn-primary border-accent bg-accent text-accent-ink'
      : 'border-line bg-surface text-ink shadow-sm hover:bg-sunken',
  );

/**
 * A−− / A− / A / A+ / A++ and the High contrast switch, remembered on this device. Settings also shows the Animations switch
 * (`withMotion`); the top bar leaves it out to stay short.
 */
export function TopBarControls({ withMotion = false }: { withMotion?: boolean }) {
  const t = useTranslations('topbar');
  const { textSize, setTextSize, contrast, setContrast, motion, setMotion } = usePreferences();
  const high = contrast === 'high';
  const moving = motion === 'on';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t('textSize')} className="flex gap-1">
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={textSize === s.value}
            onClick={() => setTextSize(s.value)}
            className={clsx(toggleClasses(textSize === s.value), '!px-2')}
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
      {withMotion && (
        <button
          type="button"
          aria-pressed={moving}
          onClick={() => setMotion(moving ? 'off' : 'on')}
          className={toggleClasses(moving)}
        >
          {t('animations')}
          <span aria-hidden="true">{moving ? t('on') : t('off')}</span>
        </button>
      )}
    </div>
  );
}
