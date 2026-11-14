'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button, FormField, Input } from '@/components/ui';
import { newId } from '@/shared/ids';

interface Result {
  existing: boolean;
  sheetRow: number;
  calendar: 'ok' | 'error';
  file?: { name: string; viewLink: string };
  fileError?: string;
}

export function SpikeForm() {
  const t = useTranslations('spike');
  // The id is made here, so pressing Save twice (or retrying after a lost answer) never makes two meetings.
  const [id] = useState(() => newId());
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:30');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setMessage('');
    const body = new FormData();
    // Text fields first: the server starts work as soon as the file begins to arrive.
    body.append('id', id);
    body.append('topic', topic);
    body.append('date', date);
    body.append('start_time', startTime);
    body.append('duration_min', '60');
    if (file) body.append('file', file);
    try {
      const res = await fetch('/api/spike/meeting', {
        method: 'POST',
        headers: { 'X-Requested-With': 'mm' },
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? t('failed'));
        setStatus('error');
        return;
      }
      setResult(data as Result);
      setStatus('done');
    } catch {
      setMessage(t('failed'));
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <FormField label={t('topic')} required>
        {(c) => (
          <Input id={c.id} value={topic} onChange={(e) => setTopic(e.target.value)} required />
        )}
      </FormField>
      <FormField label={t('date')} required>
        {(c) => (
          <Input
            id={c.id}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        )}
      </FormField>
      <FormField label={t('time')} required>
        {(c) => (
          <Input
            id={c.id}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        )}
      </FormField>
      <FormField label={t('file')} hint={t('fileHint')}>
        {(c) => (
          <Input
            id={c.id}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </FormField>
      <Button type="submit" variant="primary" size="lg" disabled={status === 'saving'}>
        {status === 'saving' ? t('saving') : t('save')}
      </Button>

      {status === 'error' && (
        <p role="alert" className="font-semibold text-danger">
          {message}
        </p>
      )}
      {status === 'done' && result && (
        <ul role="status" className="flex flex-col gap-2 font-semibold">
          <li>
            {result.existing
              ? t('alreadySaved', { row: result.sheetRow })
              : t('savedToSheet', { row: result.sheetRow })}
          </li>
          <li>{result.calendar === 'ok' ? t('onCalendar') : t('notOnCalendar')}</li>
          {result.file && (
            <li>
              {t('fileSaved')}{' '}
              <a className="underline" href={result.file.viewLink} target="_blank" rel="noreferrer">
                {result.file.name}
              </a>
            </li>
          )}
          {result.fileError && <li>{t('fileFailed')}</li>}
        </ul>
      )}
    </form>
  );
}
