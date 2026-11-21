'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Tile, TrackerKpis } from '@/shared/trackerKpis';

/** Tiles that have a second line of words. */
const WITH_DETAIL = new Set<Tile['id']>([
  'awardedYear',
  'dueSoon',
  'overdue',
  'late',
  'pipeline',
  'statusMix',
  'length',
]);
const COUNTS = new Set(['worst', 'days', 'count', 'done', 'hold']);

const NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
export const num = (n: number) => NUMBER.format(n);

/** The address of a tracker's list with a tile's filter applied. */
export function tileHref(slug: string, tile: Pick<Tile, 'preset' | 'days' | 'group'>): string {
  const q = new URLSearchParams({ show: tile.preset });
  if (tile.days) q.set('days', String(tile.days));
  if (tile.group) q.set('group', tile.group);
  return `/trackers/${slug}?${q.toString()}`;
}

/** Words for a tile: its label and, when there is something to add, a second line. */
export function useTileWords() {
  const t = useTranslations('trackers');
  return (tile: Tile): { label: string; detail: string | null; value: string } => {
    const p = tile.params;
    const fmt = Object.fromEntries(
      // Plural counts stay numbers for the message format; amounts are written the Indian way (1,23,456.7).
      Object.entries(p).map(([k, v]) => [k, typeof v === 'number' && !COUNTS.has(k) ? num(v) : v]),
    );
    const label = t(`tile_${tile.id}` as 'tile_open', fmt);
    let detail: string | null = null;
    const key = `tile_${tile.id}_detail`;
    const hasNumbers =
      tile.id === 'overdue' || tile.id === 'late'
        ? tile.value > 0
        : tile.id === 'dueSoon'
          ? Number(p.km) > 0
          : tile.id === 'statusMix' || tile.id === 'length'
            ? true
            : tile.id === 'awardedYear' || tile.id === 'pipeline'
              ? Number(p.km) > 0 || Number(p.cr) > 0
              : false;
    if (hasNumbers && WITH_DETAIL.has(tile.id)) detail = t(key as 'tile_open', fmt);
    return { label, detail, value: num(tile.value) };
  };
}

/** Up to four numbers, each opening the list with the matching filter. Red when something needs attention. */
export function KpiTiles({ slug, kpis }: { slug: string; kpis: TrackerKpis }) {
  const words = useTileWords();
  const t = useTranslations('trackers');
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.tiles.map((tile) => {
        const w = words(tile);
        const alert = tile.tone === 'alert' && tile.value > 0;
        return (
          <li key={tile.id}>
            <Link
              href={tileHref(slug, tile)}
              className={clsx(
                'lift flex h-full min-h-tap flex-col gap-1 rounded-2xl border-ui bg-surface p-3 shadow-sm hover:bg-sunken md:p-4',
                alert ? 'border-danger' : 'border-soft',
              )}
            >
              <span
                className={clsx(
                  'font-display text-3xl font-semibold leading-none',
                  alert ? 'text-danger' : tile.tone === 'good' ? 'text-accent' : 'text-ink',
                )}
              >
                {w.value}
              </span>
              <span className="font-semibold leading-snug">{w.label}</span>
              {w.detail && <span className="text-muted leading-snug">{w.detail}</span>}
              <span className="sr-only">{` — ${t('tileOpens')}`}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
