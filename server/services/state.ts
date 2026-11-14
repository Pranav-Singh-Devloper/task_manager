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

  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'state.json');
  }

  async read(): Promise<AppState | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      const state = parsed as Partial<AppState>;
      return { ...state, jobs: state.jobs && typeof state.jobs === 'object' ? state.jobs : {} };
    } catch {
      return null;
    }
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
