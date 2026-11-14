import type { Meeting } from '../../../shared/meeting';
import { AppError, ConflictError, NotFoundError, ValidationFailed } from '../../lib/errors';
import { toMeeting } from '../meetingView';
import type { Actor } from '../meetings';
import type { SheetStore } from '../store';

/** The word a person types to delete something for good. */
export const PURGE_WORD = 'DELETE';

/** Every meeting in the trash, most recently deleted first (§7.9 c). */
export async function listTrash(store: SheetStore): Promise<Meeting[]> {
  const snap = await store.snapshot();
  const out: Meeting[] = [];
  for (const [slug, data] of snap.categories) {
    for (const entry of data.entries.values()) {
      if (entry.record.system.deleted_at) out.push(toMeeting(store, snap, slug, entry));
    }
  }
  return out.sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''));
}

/**
 * Delete forever (§9 rule 9): only from the trash, only with the typed word. The row is removed, its Drive files go to the
 * Drive trash, and a `purge` entry is kept in the change log. Nothing is ever purged automatically.
 */
export async function purgeMeeting(
  store: SheetStore,
  id: string,
  confirm: string,
  actor: Actor,
): Promise<void> {
  if (confirm.trim().toUpperCase() !== PURGE_WORD) {
    throw new ValidationFailed([
      { field: 'confirm', message: `Please type the word ${PURGE_WORD} to confirm.` },
    ]);
  }
  const first = await store.snapshot();
  let slug: string | null = null;
  for (const [s, data] of first.categories) if (data.entries.has(id)) slug = s;
  if (!slug) throw new NotFoundError("We couldn't find that meeting.");
  const cfg = first.config.byCategory.get(slug)!;
  const title = toMeeting(store, first, slug, first.categories.get(slug)!.entries.get(id)!).title;

  await store.mutex.run(store.tabKey(cfg.tab.gid), async () => {
    const snap = await store.snapshot();
    const data = snap.categories.get(slug)!;
    const entry = data.entries.get(id);
    if (!entry) throw new NotFoundError("We couldn't find that meeting.");
    if (!entry.record.system.deleted_at) {
      throw new AppError(
        409,
        'not_in_trash',
        'Only meetings in the Trash can be deleted for good. Delete it first.',
      );
    }
    const live = await store.google.sheets.getRow(store.spreadsheetId, cfg.tab.gid, entry.row);
    if (live[data.headers.indexOf('id')] !== id) {
      await store.reindexTab(slug);
      throw new ConflictError();
    }
    await store.google.sheets.deleteRow(store.spreadsheetId, cfg.tab.gid, entry.row);
  });

  // The files go to the Drive trash (recoverable for 30 days). A hiccup here must not undo the purge.
  for (const f of store.filesFor(id)) {
    await store.google.drive.trashFile(f.drive_file_id).catch(() => undefined);
  }
  await store.log.audit({
    user: actor.email,
    action: 'purge',
    table: cfg.tab.title,
    rowId: id,
    changes: { title: [title, null] },
    source: actor.source,
  });
  await store.refresh();
}
