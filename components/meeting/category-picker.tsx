'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Meta } from '@/lib/queries';
import { PageTitle } from '@/components/motion';

/** Step 1 of a new meeting: big tiles, one per kind of meeting. Every tile says its name in words (§7.4). */
export function CategoryPicker({ meta, keep }: { meta: Meta; keep?: boolean }) {
  const t = useTranslations('newMeeting');
  const tile =
    'lift flex min-h-[5rem] items-center gap-3 rounded-2xl border-ui border-line bg-surface p-4 text-lg font-semibold shadow-sm hover:bg-sunken';
  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle className="mb-2">{t('chooseCategory')}</PageTitle>
        <p>{t('chooseHint')}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {meta.categories
          .filter((c) => c.active)
          .map((c) => (
            <li key={c.slug}>
              <Link
                href={`/meetings/new?category=${c.slug}${keep ? '&keep=1' : ''}`}
                className={tile}
                style={{ borderLeft: `0.5rem solid ${c.color}` }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        <li>
          <Link href="/categories/new" className={`${tile} border-dashed`}>
            {t('addCategory')}
          </Link>
        </li>
      </ul>
    </div>
  );
}
