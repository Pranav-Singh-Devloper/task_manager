'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonClasses, Chip, FormField, Input, RadioChips, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta, type Meta } from '@/lib/queries';
import { CATEGORY_PALETTE, FIELD_TYPE_LABELS } from '@/shared/seed';
import type { CategoryDef, FieldDef } from '@/shared/types';
import { TypedConfirm } from './typed-confirm';

/** Admin, Columns & categories (§7.9 b): change what the forms and tables ask for, with no developer. */
export function ColumnsScreen() {
  const t = useTranslations('admin');
  const meta = useMeta();
  const router = useRouter();
  const pathname = usePathname();
  const picked = useSearchParams().get('category') ?? '';
  if (meta.isPending) return <p>{t('loading')}</p>;
  if (meta.isError || !meta.data) return <p className="font-semibold">{t('loadFailed')}</p>;
  const slug = picked || meta.data.categories[0]?.slug || '';
  return (
    <Manager
      meta={meta.data}
      slug={slug}
      onPick={(s) => router.replace(`${pathname}?category=${s}`, { scroll: false })}
    />
  );
}

function Manager({
  meta,
  slug,
  onPick,
}: {
  meta: Meta;
  slug: string;
  onPick: (s: string) => void;
}) {
  const t = useTranslations('admin');
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [removingKey, setRemovingKey] = useState('');
  const [removeError, setRemoveError] = useState('');
  const category = meta.categories.find((c) => c.slug === slug);
  const fields = meta.fields
    .filter((f) => f.category_slug === slug)
    .sort((a, b) => a.order - b.order);

  async function run(call: () => Promise<unknown>, done: string) {
    setMessage('');
    try {
      await call();
      await client.invalidateQueries();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('cellFailed'));
    }
  }

  const patch = (f: FieldDef, body: Record<string, unknown>, done: string) =>
    run(() => api(`/admin/fields/${f.category_slug}/${f.key}`, { method: 'PATCH', body }), done);
  const move = (f: FieldDef, direction: 'up' | 'down') =>
    run(
      () =>
        api(`/admin/fields/${f.category_slug}/${f.key}/move`, {
          method: 'POST',
          body: { direction },
        }),
      t('moved', { name: f.label }),
    );

  // Delete for good, straight from the list: the same typed confirmation and backup as on the Edit page.
  async function remove(f: FieldDef, confirm: string) {
    setRemoveError('');
    setMessage('');
    try {
      await api(`/admin/fields/${f.category_slug}/${f.key}/remove`, {
        method: 'POST',
        body: { confirm },
      });
      setRemovingKey('');
      await client.invalidateQueries();
      setMessage(t('deletedColumn', { name: f.label }));
    } catch (e) {
      setRemoveError(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('cellFailed'));
    }
  }
  const startRemove = (f: FieldDef) => {
    setRemoveError('');
    setRemovingKey(f.key);
  };
  const deleteButton = (f: FieldDef) =>
    removingKey !== f.key && (
      <Button variant="danger" onClick={() => startRemove(f)}>
        {t('deleteColumn')}
        <span className="sr-only">{` — ${f.label}`}</span>
      </Button>
    );
  const confirmBox = (f: FieldDef) =>
    removingKey === f.key && (
      <div className="w-full">
        <TypedConfirm
          word={f.label}
          warning={t('removeColumnWarning')}
          confirmLabel={t('removeForGood')}
          error={removeError}
          onConfirm={(typed) => void remove(f, typed)}
          onCancel={() => setRemovingKey('')}
        />
      </div>
    );

  const visible = fields.filter((f) => !f.archived);
  const hidden = fields.filter((f) => f.archived);

  return (
    <section aria-labelledby="columns-heading" className="flex flex-col gap-6">
      <h2 id="columns-heading">{t('tabColumns')}</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[16rem]">
          <FormField name="category" label={t('category')}>
            {(c) => (
              <Select
                id={c.id}
                value={slug}
                onChange={(e) => onPick(e.target.value)}
                options={meta.categories.map((x) => ({
                  value: x.slug,
                  label: x.active ? x.name : `${x.name} ${t('hiddenSuffix')}`,
                }))}
              />
            )}
          </FormField>
        </div>
        <Link href="/categories/new" className={buttonClasses('outline')}>
          {t('addCategory')}
        </Link>
      </div>

      <p role="status" className="min-h-6 font-semibold">
        {message}
      </p>

      {category && (
        <CategorySettings key={category.slug} category={category} meta={meta} run={run} />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-semibold">
            {t('columnsOf', { name: category?.name ?? '' })}
          </h3>
          <Link href={`/admin/columns/${slug}/new`} className={buttonClasses('primary')}>
            {t('addColumn')}
          </Link>
        </div>
        <ul className="flex flex-col gap-3">
          {visible.map((f, i) => (
            <li
              key={f.key}
              className="flex flex-col gap-3 rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold">{f.label}</span>
                <Chip>{FIELD_TYPE_LABELS[f.type]}</Chip>
                {f.locked && <Chip>{t('alwaysThere')}</Chip>}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Toggle
                  label={t('required')}
                  name={f.label}
                  checked={f.required}
                  disabled={f.locked && f.type !== 'text'}
                  onChange={(v) => void patch(f, { required: v }, t('saved', { name: f.label }))}
                />
                {f.locked ? (
                  <span className="font-semibold">{t('alwaysShown')}</span>
                ) : (
                  <Toggle
                    label={t('showInForm')}
                    name={f.label}
                    checked={f.show_in_form}
                    disabled={f.type === 'computed'}
                    onChange={(v) =>
                      void patch(f, { show_in_form: v }, t('saved', { name: f.label }))
                    }
                  />
                )}
                <Toggle
                  label={t('showInTable')}
                  name={f.label}
                  checked={f.show_in_table}
                  onChange={(v) =>
                    void patch(f, { show_in_table: v }, t('saved', { name: f.label }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={i === 0} onClick={() => void move(f, 'up')}>
                  {t('moveUp')}
                  <span className="sr-only">{` — ${f.label}`}</span>
                </Button>
                <Button disabled={i === visible.length - 1} onClick={() => void move(f, 'down')}>
                  {t('moveDown')}
                  <span className="sr-only">{` — ${f.label}`}</span>
                </Button>
                <Link
                  href={`/admin/columns/${f.category_slug}/${f.key}`}
                  className={buttonClasses('outline')}
                >
                  {t('edit')}
                  <span className="sr-only">{` — ${f.label}`}</span>
                </Link>
                {!f.locked && (
                  <Button
                    onClick={() => void patch(f, { archived: true }, t('hid', { name: f.label }))}
                  >
                    {t('hide')}
                    <span className="sr-only">{` — ${f.label}`}</span>
                  </Button>
                )}
                {!f.locked && deleteButton(f)}
              </div>
              {confirmBox(f)}
            </li>
          ))}
        </ul>
        {hidden.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-2xl font-semibold">{t('hiddenColumns')}</h3>
            <p className="text-muted">{t('hiddenHint')}</p>
            <ul className="flex flex-col gap-3">
              {hidden.map((f) => (
                <li
                  key={f.key}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-4"
                >
                  <span className="flex-1 text-lg font-semibold">{f.label}</span>
                  <Button
                    onClick={() =>
                      void patch(f, { archived: false }, t('shown', { name: f.label }))
                    }
                  >
                    {t('show')}
                    <span className="sr-only">{` — ${f.label}`}</span>
                  </Button>
                  <Link
                    href={`/admin/columns/${f.category_slug}/${f.key}`}
                    className={buttonClasses('outline')}
                  >
                    {t('edit')}
                    <span className="sr-only">{` — ${f.label}`}</span>
                  </Link>
                  {!f.locked && deleteButton(f)}
                  {confirmBox(f)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Toggle({
  label,
  name,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
      <input
        type="checkbox"
        className="h-6 w-6"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        <span className="sr-only">{` — ${name}`}</span>
      </span>
    </label>
  );
}

function CategorySettings({
  category,
  meta,
  run,
}: {
  category: CategoryDef;
  meta: Meta;
  run: (call: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const cat = useTranslations('category');
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [workspace, setWorkspace] = useState(category.default_workspace);
  const [template, setTemplate] = useState(category.title_template);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const client = useQueryClient();

  const save = () =>
    run(
      () =>
        api(`/admin/categories/${category.slug}`, {
          method: 'PATCH',
          body: { name, color, default_workspace: workspace, title_template: template },
        }),
      t('categorySaved'),
    );

  async function remove(confirm: string) {
    setRemoveError('');
    try {
      await api(`/admin/categories/${category.slug}/remove`, { method: 'POST', body: { confirm } });
      await client.invalidateQueries();
      setRemoving(false);
    } catch (e) {
      setRemoveError(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('cellFailed'));
    }
  }

  return (
    <details className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-5">
      <summary className="min-h-tap cursor-pointer text-2xl font-semibold">
        {t('categorySettings', { name: category.name })}
      </summary>
      <form
        noValidate
        className="mt-4 flex max-w-xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormField name="cat-name" label={t('name')}>
          {(c) => (
            <Input
              id={c.id}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        <FormField name="cat-color" label={t('colour')} group>
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
        <FormField name="cat-workspace" label={t('defaultWorkspace')}>
          {(c) => (
            <Select
              id={c.id}
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              options={meta.workspaces.map((w) => ({ value: w.slug, label: w.name }))}
            />
          )}
        </FormField>
        <FormField name="cat-template" label={t('titleTemplate')} hint={t('titleTemplateHint')}>
          {(c) => (
            <Input
              id={c.id}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              aria-describedby={c['aria-describedby']}
            />
          )}
        </FormField>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="primary">
            {t('saveCategory')}
          </Button>
          <Button
            onClick={() =>
              void run(
                () =>
                  api(`/admin/categories/${category.slug}`, {
                    method: 'PATCH',
                    body: { active: !category.active },
                  }),
                category.active ? t('categoryHidden') : t('categoryShown'),
              )
            }
          >
            {category.active ? t('hideCategory') : t('showCategory')}
          </Button>
          <Button variant="danger" onClick={() => setRemoving(true)}>
            {t('removeCategory')}
          </Button>
        </div>
        {removing && (
          <TypedConfirm
            word={category.name}
            warning={t('removeCategoryWarning')}
            confirmLabel={t('removeForGood')}
            error={removeError}
            onConfirm={(typed) => void remove(typed)}
            onCancel={() => setRemoving(false)}
          />
        )}
      </form>
    </details>
  );
}
