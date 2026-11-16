'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { sizeText, uploadFile } from '@/lib/upload';
import type { Meeting, MeetingFile } from '@/shared/meeting';

/** A file uploaded for a meeting that is not saved yet. It is attached when the meeting is saved. */
export interface PendingFile {
  id: string;
  name: string;
  size: number;
  /** A restored draft whose file has been cleared away since: it must be added again. */
  expired?: boolean;
}

interface Uploading {
  key: string;
  name: string;
  percent: number;
  error?: string;
}

interface Props {
  meetingId: string;
  category: string;
  /** For the file's name in Drive while the meeting is not saved yet. */
  context?: { date?: string; title?: string };
  /** Files already attached to the saved meeting. */
  saved: MeetingFile[];
  /** Called after a saved file is added or removed, with the meeting as it is now. */
  onSavedChange: (meeting: Meeting | null) => void;
  pending?: PendingFile[];
  onPendingChange?: (next: PendingFile[]) => void;
  /** The meeting is already saved (its own page): added files attach straight away. */
  attachNow?: boolean;
}

const ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,application/pdf';

/** Files for a meeting (§7.3, §7.4): a list with Open and Remove, and an Add files button with progress. */
export function FilesField({
  meetingId,
  category,
  context,
  saved,
  onSavedChange,
  pending = [],
  onPendingChange,
  attachNow = false,
}: Props) {
  const t = useTranslations('files');
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const counter = useRef(0);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const patch = (key: string, change: Partial<Uploading>) =>
    setUploading((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));

  async function addAll(files: File[]) {
    setNotice('');
    for (const file of files) {
      counter.current += 1;
      const key = `${counter.current}-${file.name}`;
      setUploading((list) => [...list, { key, name: file.name, percent: 0 }]);
      try {
        const r = await uploadFile({
          file,
          meetingId,
          category,
          date: context?.date,
          title: context?.title,
          attach: attachNow,
          onProgress: (percent) => patch(key, { percent }),
        });
        setUploading((list) => list.filter((u) => u.key !== key));
        if (r.file.status === 'attached') onSavedChange(r.meeting);
        else
          onPendingChange?.([
            ...pendingRef.current,
            { id: r.file.id, name: r.file.name, size: r.file.size },
          ]);
        setNotice(t('added', { name: file.name }));
      } catch (e) {
        patch(key, { error: e instanceof ApiError ? e.message : t('failed') });
      }
    }
  }

  async function removeSaved(f: MeetingFile) {
    setBusy(f.id);
    setNotice('');
    try {
      const r = await api<{ meeting: Meeting | null }>(`/files/${f.id}`, { method: 'DELETE' });
      onSavedChange(r.meeting);
      setNotice(t('removed', { name: f.name }));
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : t('removeFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function removePending(p: PendingFile) {
    setBusy(p.id);
    setNotice('');
    try {
      if (!p.expired) await api(`/files/${p.id}`, { method: 'DELETE' });
    } catch (e) {
      // Already gone is fine: the goal is that it is not attached.
      if (!(e instanceof ApiError && e.status === 404)) {
        setNotice(e instanceof ApiError ? e.message : t('removeFailed'));
        setBusy(null);
        return;
      }
    }
    onPendingChange?.(pendingRef.current.filter((x) => x.id !== p.id));
    setNotice(t('removed', { name: p.name }));
    setBusy(null);
  }

  const empty = saved.length === 0 && pending.length === 0 && uploading.length === 0;

  return (
    <div id="field-files" className="flex flex-col gap-3">
      {empty ? (
        <p className="text-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {saved.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-3"
            >
              <span className="min-w-0 flex-1 break-words font-semibold">
                {f.name}
                {f.size > 0 && (
                  <span className="block font-normal text-muted">{sizeText(f.size)}</span>
                )}
              </span>
              <a
                href={f.view_link}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses('outline')}
              >
                {t('open')}
                <span className="sr-only">{` — ${f.name}`}</span>
              </a>
              <Button disabled={busy === f.id} onClick={() => void removeSaved(f)}>
                {t('remove')}
                <span className="sr-only">{` — ${f.name}`}</span>
              </Button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-3"
            >
              <span className="min-w-0 flex-1 break-words font-semibold">
                {p.name}
                <span className="block font-normal text-muted">
                  {p.expired ? t('expired') : t('willSave')}
                </span>
              </span>
              <Button disabled={busy === p.id} onClick={() => void removePending(p)}>
                {t('remove')}
                <span className="sr-only">{` — ${p.name}`}</span>
              </Button>
            </li>
          ))}
          {uploading.map((u) => (
            <li
              key={u.key}
              className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-3"
            >
              <span className="min-w-0 flex-1 break-words font-semibold">
                {u.name}
                <span
                  className={
                    u.error ? 'block font-semibold text-danger' : 'block font-normal text-muted'
                  }
                >
                  {u.error ?? t('adding', { percent: u.percent })}
                </span>
              </span>
              {u.error && (
                <Button onClick={() => setUploading((list) => list.filter((x) => x.key !== u.key))}>
                  {t('dismiss')}
                  <span className="sr-only">{` — ${u.name}`}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (picked.length > 0) void addAll(picked);
          }}
        />
        <Button onClick={() => input.current?.click()}>{t('add')}</Button>
      </div>
      <p className="text-muted">{t('hint')}</p>
      <p role="status" className="min-h-0 font-semibold">
        {notice}
      </p>
    </div>
  );
}
