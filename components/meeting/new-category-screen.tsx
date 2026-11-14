'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonClasses, Chip, FormField, Input, RadioChips } from '@/components/ui';
import { ApiError, NetworkError, api } from '@/lib/api';
import { CATEGORY_PALETTE } from '@/shared/seed';

/** The "+ Add new category" page: a name and a colour. A full page, never a popup. */
export function NewCategoryScreen() {
  const t = useTranslations('category');
  const common = useTranslations('common');
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    setErrors({});
    setFailure('');
    setSaving(true);
    try {
      const { category } = await api<{ category: { slug: string } }>('/categories', {
        method: 'POST',
        body: { name, color },
      });
      await client.invalidateQueries({ queryKey: ['meta'] });
      router.push(`/meetings/new?category=${category.slug}`);
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
      } else {
        setFailure(e instanceof NetworkError || !(e instanceof ApiError) ? t('failed') : e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const colorName = (i: number) => t(`c${i}` as 'c0');
  const chosen = Math.max(0, CATEGORY_PALETTE.indexOf(color as (typeof CATEGORY_PALETTE)[number]));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="flex max-w-xl flex-col gap-6 pb-8"
    >
      <div>
        <h1 className="mb-2">{t('title')}</h1>
        <p>{t('intro')}</p>
      </div>
      <FormField name="name" label={t('name')} required error={errors.name}>
        {(c) => (
          <Input
            id={c.id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            maxLength={60}
          />
        )}
      </FormField>
      <FormField name="color" label={t('color')} error={errors.color} group>
        {(c) => (
          <RadioChips
            aria-labelledby={c.labelId}
            value={color}
            onValueChange={setColor}
            options={CATEGORY_PALETTE.map((hex, i) => ({ value: hex, label: colorName(i) }))}
          />
        )}
      </FormField>
      <p>
        <Chip color={color}>{name.trim() || colorName(chosen)}</Chip>
      </p>
      {failure && (
        <p role="alert" className="font-semibold text-danger">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {saving ? t('creating') : t('create')}
        </Button>
        <Link href="/meetings/new" className={buttonClasses('outline', 'lg')}>
          {common('cancel')}
        </Link>
      </div>
    </form>
  );
}
