import type { MailClient } from '../types';
import type { FailureInjector } from './failure';
import type { MockWorld } from './world';

export class MockMail implements MailClient {
  constructor(
    private world: MockWorld,
    private failures: FailureInjector,
  ) {}

  async send(message: { to: string; subject: string; html: string }): Promise<void> {
    this.failures.check('mail');
    this.world.outbox.push({ ...message });
  }
}
