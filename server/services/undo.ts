import { randomBytes } from 'node:crypto';
import type { FieldValue } from '../../shared/types';

/** An undo is valid for 10 minutes, and only while nobody has changed the row since (§9 rule 19). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/** What to put back on one meeting. */
export interface UndoRevert {
  /** The old values of the fields that changed. */
  values: Record<string, FieldValue>;
  deleted_at?: string;
  awaiting_next?: boolean;
}

/** One meeting to restore, and the rev it must still have. */
export interface UndoStep {
  meetingId: string;
  categorySlug: string;
  /** The rev the row has right after the action. If it is different later, the undo is refused. */
  expectedRev: number;
  revert: UndoRevert;
}

export interface UndoRecord extends UndoStep {
  user: string;
  /** A short plain-language label, e.g. "Meeting cancelled". */
  label: string;
  /** A second meeting changed by the same action, undone first (the next meeting the done flow made). */
  also?: UndoStep;
}

/**
 * Undo is an inverse operation, not a delayed commit: the change is already saved, so closing the browser never loses it,
 * and undo applies the reverse through the same service layer (§9 rule 19). Tokens live in memory only.
 */
export class UndoService {
  private tokens = new Map<string, UndoRecord & { expiresAt: number }>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  issue(record: UndoRecord): string {
    this.sweep();
    const token = randomBytes(24).toString('base64url');
    this.tokens.set(token, { ...record, expiresAt: this.clock().getTime() + UNDO_WINDOW_MS });
    return token;
  }

  /** Returns the record if the token is still good, without using it up. */
  peek(token: string): UndoRecord | null {
    const found = this.tokens.get(token);
    if (!found) return null;
    if (found.expiresAt < this.clock().getTime()) {
      this.tokens.delete(token);
      return null;
    }
    return found;
  }

  /** A token works once. */
  consume(token: string): void {
    this.tokens.delete(token);
  }

  private sweep(): void {
    const now = this.clock().getTime();
    for (const [t, r] of this.tokens) if (r.expiresAt < now) this.tokens.delete(t);
  }
}
