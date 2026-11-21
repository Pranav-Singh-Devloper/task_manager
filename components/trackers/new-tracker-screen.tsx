'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageTitle } from '@/components/motion';
import { Button, FormField, Input, RadioChips, buttonClasses, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { CATEGORY_PALETTE } from '@/shared/seed';

/**
 * "ADD++" in the owner's sketch: a new list. A name, what one row is called, and a colour; it starts with a name,
 * status, due date and remarks, and more columns are added in Admin straight after.
 */
export function NewTrackerScreen() {
  const t = useTranslations('trackers');
  const cat = useTranslations('category');
  const common = useTranslations('common');
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [itemName, setItemName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[6]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    setErrors({});
    setFailure('');
    setSaving(true);
    try {
      const { tracker } = await api<{ tracker: { slug: string } }>('/admin/trackers', {
        method: 'POST',
        body: { name, item_name: itemName, color },
      });
      await client.invalidateQueries();
      toast.show({ message: t('listMade') });
      router.push(`/admin/columns?category=${tracker.slug}`);
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0)
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
      else setFailure(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="flex max-w-xl flex-col gap-5 pb-8"
    >
      <div>
        <PageTitle className="mb-2">{t('newListTitle')}</PageTitle>
        <p>{t('newListIntro')}</p>
      </div>
      <FormField
        name="name"
        label={t('listName')}
        hint={t('listNameHint')}
        required
        error={errors.name}
      >
        {(c) => (
          <Input
            id={c.id}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
          />
        )}
      </FormField>
      <FormField
        name="item_name"
        label={t('itemName')}
        hint={t('itemNameHint')}
        required
        error={errors.item_name}
      >
        {(c) => (
          <Input
            id={c.id}
            value={itemName}
            maxLength={40}
            onChange={(e) => setItemName(e.target.value)}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
          />
        )}
      </FormField>
      <FormField name="color" label={cat('color')} error={errors.color} group>
        {(c) => (
          <RadioChips
            aria-labelledby={c.labelId}
            value={color}
            onValueChange={setColor}
            options={CATEGORY_PALETTE.map((hex, i) => ({
              value: hex,
              label: cat(`c${i}` as 'c0'),
            }))}
          />
        )}
      </FormField>
      {failure && (
        <p role="alert" className="font-semibold text-danger">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {saving ? t('saving') : t('makeList')}
        </Button>
        <Link href="/" className={buttonClasses('outline', 'lg')}>
          {common('cancel')}
        </Link>
      </div>
    </form>
  );
}
