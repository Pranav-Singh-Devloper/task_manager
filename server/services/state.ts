import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppState, StateStore } from './google/types';

/**
 * DATA_DIR/state.json holds the encrypted owner token and the ids the server needs before it can talk to Google.
 * Writes are atomic: temp file, fsync, rename. A missing or unreadable file means "start again":
 * the owner signs in once more and the database is found again in Drive. No data is lost.
 */
export class FileStateStore implements StateStore {
  private readonly file: string;

  /**
   * `ownerEmail` is the owner the server is set up for (OWNER_EMAIL). When the file belongs to a different owner,
   * because OWNER_EMAIL was changed, it is moved aside to `state.previous-owner-<time>.json` and the app starts
   * again: the new owner signs in and gets a database in their own Drive. Putting the old file back and setting
   * OWNER_EMAIL back returns to the previous owner's database.
   */
  constructor(
    private readonly dir: string,
    private readonly ownerEmail?: string,
  ) {
    this.file = path.join(dir, 'state.json');
  }

  async read(): Promise<AppState | null> {
    let state: Partial<AppState>;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      state = parsed as Partial<AppState>;
    } catch {
      return null;
    }
    const owner = this.ownerEmail?.toLowerCase();
    if (owner && typeof state.ownerEmail === 'string' && state.ownerEmail.toLowerCase() !== owner) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs
        .rename(this.file, path.join(this.dir, `state.previous-owner-${stamp}.json`))
        .catch(() => undefined);
      return null;
    }
    return { ...state, jobs: state.jobs && typeof state.jobs === 'object' ? state.jobs : {} };
  }

  async write(state: AppState): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(state, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tmp, this.file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    // Make the rename itself durable. Not every platform allows opening a directory, so this is best effort.
    try {
      const dirHandle = await fs.open(this.dir, 'r');
      await dirHandle.sync();
      await dirHandle.close();
    } catch {
      // ignore
    }
  }
}
