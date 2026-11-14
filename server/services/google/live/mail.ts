import { GoogleApiError } from '../errors';
import type { MailClient } from '../types';

/** The morning email arrives in Phase 2, with incremental consent for gmail.send. */
export class LiveMail implements MailClient {
  async send(): Promise<void> {
    throw new GoogleApiError(501, 'The morning email is not available yet.', 'not_implemented');
  }
}
