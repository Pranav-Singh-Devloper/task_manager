'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Button,
  Card,
  CardTitle,
  Chip,
  Combobox,
  ConfirmDialog,
  FormField,
  Input,
  RadioChips,
  Select,
  useToast,
} from '@/components/ui';
import { CATEGORY_PALETTE, INDIAN_STATES_AND_UTS } from '@/shared/seed';

export function KitDemo() {
  const t = useTranslations('design');
  const common = useTranslations('common');
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState('scheduled');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-2">{t('title')}</h1>
        <p>{t('intro')}</p>
      </div>

      <section aria-labelledby="buttons" className="flex flex-col gap-3">
        <h2 id="buttons">{t('buttons')}</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">{t('primary')}</Button>
          <Button>{t('outline')}</Button>
          <Button variant="danger">{t('danger')}</Button>
        </div>
      </section>

      <section aria-labelledby="fields" className="flex max-w-xl flex-col gap-5">
        <h2 id="fields">{t('fields')}</h2>
        <FormField
          label={t('topic')}
          required
          hint={t('topicHint')}
          error={topic === 'x' ? t('topicError') : undefined}
        >
          {(c) => (
            <Input
              id={c.id}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
        <FormField label={t('category')}>
          {(c) => (
            <Select
              id={c.id}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('categoryPlaceholder')}
              options={[
                { value: 'ccie', label: 'CCIE' },
                { value: 'at', label: 'AT' },
              ]}
            />
          )}
        </FormField>
        <FormField label={t('state')}>
          {(c) => (
            <Combobox
              id={c.id}
              options={INDIAN_STATES_AND_UTS}
              value={state}
              onChange={setState}
              allowNew
              placeholder={t('statePlaceholder')}
            />
          )}
        </FormField>
        <FormField label={t('status')} group>
          {(c) => (
            <RadioChips
              aria-labelledby={c.labelId}
              value={status}
              onValueChange={setStatus}
              options={[
                { value: 'scheduled', label: t('scheduled') },
                { value: 'completed', label: t('completed') },
                { value: 'cancelled', label: t('cancelled') },
              ]}
            />
          )}
        </FormField>
      </section>

      <section aria-labelledby="chips" className="flex flex-col gap-3">
        <h2 id="chips">{t('chips')}</h2>
        <div className="flex flex-wrap gap-2">
          <Chip color={CATEGORY_PALETTE[0]}>{t('scheduled')}</Chip>
          <Chip color={CATEGORY_PALETTE[1]}>{t('completed')}</Chip>
          <Chip color={CATEGORY_PALETTE[3]}>{t('cancelled')}</Chip>
        </div>
      </section>

      <section aria-labelledby="card" className="flex flex-col gap-3">
        <h2 id="card">{t('card')}</h2>
        <Card>
          <CardTitle as="h3">{t('cardTitle')}</CardTitle>
          <p>{t('cardBody')}</p>
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => toast.show({ message: t('toastMessage'), actionLabel: common('undo') })}
          >
            {t('showToast')}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>{t('openDialog')}</Button>
        </div>
      </section>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t('dialogTitle')}
        description={t('dialogBody')}
        confirmLabel={t('dialogConfirm')}
        onConfirm={() => undefined}
        destructive
      />
    </div>
  );
}
