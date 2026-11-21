import { createDatabase, type CreatedDatabase } from '../../databaseSeed';
import type { GoogleServices } from '../types';
import { MockCalendar } from './calendar';
import { MIGRATIONS, runMigrations } from '../../bootstrap';
import { seedDemoMeetings } from './demo';
import { seedDemoTrackers } from './demoTrackers';
import { MockDrive } from './drive';
import { FailureInjector } from './failure';
import { MockMail } from './mail';
import { MockSheets } from './sheets';
import { MockStateStore } from './state';
import { MockWorld } from './world';

export interface MockOptions {
  /** MOCK_FAIL value, e.g. "calendar,drive". */
  failures?: string;
  /** "demo": a database with demo meetings already exists in Drive. "empty": a clean Google account. */
  seed?: 'demo' | 'empty';
  now?: Date;
  timezone?: string;
}

export interface MockGoogle {
  services: GoogleServices;
  world: MockWorld;
  failures: FailureInjector;
  state: MockStateStore;
  /** Set when seed is "demo". */
  database?: CreatedDatabase;
}

/** Builds the full mock Google account. The whole app can run on this without any credentials. */
export async function createMockGoogle(options: MockOptions = {}): Promise<MockGoogle> {
  const world = new MockWorld();
  const failures = new FailureInjector(); // armed after seeding so seeding itself never fails
  const state = new MockStateStore();
  const sheets = new MockSheets(world, failures);
  const drive = new MockDrive(world, failures);
  const calendar = new MockCalendar(world, failures);
  const mail = new MockMail(world, failures);
  const services: GoogleServices = { mode: 'mock', sheets, drive, calendar, mail, state };

  let database: CreatedDatabase | undefined;
  if ((options.seed ?? 'demo') === 'demo') {
    const now = options.now ?? new Date();
    database = await createDatabase(services, now);
    await seedDemoMeetings(services, database, now, options.timezone ?? 'Asia/Kolkata');
    await runMigrations(services, database.spreadsheetId, MIGRATIONS);
    await seedDemoTrackers(
      services,
      database.spreadsheetId,
      now,
      options.timezone ?? 'Asia/Kolkata',
    );
  }

  failures.load(options.failures ?? '');
  return { services, world, failures, state, database };
}
