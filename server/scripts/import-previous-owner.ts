/**
 * One-time copy of the previous owner's database into the current owner's (see importPlan.ts for what goes where).
 *
 *   node dist/server/scripts/import-previous-owner.js            shows the plan, writes nothing
 *   node dist/server/scripts/import-previous-owner.js --apply    copies
 *
 * It reads the old spreadsheet with the previous owner's saved access (the file the owner switch moved aside) and
 * writes through the app's own services, so every row is checked, logged and, for upcoming meetings, put on the
 * current owner's calendar. Safe to run again: meetings keep their ids and copied rows get fixed ids.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppState, StateStore } from '../services/google/types';
import { loadEnv } from '../env';
import { createLogger } from '../lib/logger';
import { GoogleAuth } from '../services/google/auth';
import { LiveSheets } from '../services/google/live/sheets';
import { createGoogleServices } from '../services/google';
import { DataLayer } from '../services/data';
import { applyPlan } from './importApply';
import { buildPlan, type ImportPlan } from './importPlan';

async function previousState(dir: string, given?: string): Promise<AppState> {
  let file = given;
  if (!file) {
    const names = (await fs.readdir(dir)).filter((n) => n.startsWith('state.previous-owner-'));
    names.sort();
    const last = names[names.length - 1];
    if (!last) throw new Error('No previous owner file was found in the data folder.');
    file = path.join(dir, last);
  }
  return JSON.parse(await fs.readFile(file, 'utf8')) as AppState;
}

function summary(plan: ImportPlan): string {
  const lines = [
    `Settings: ${JSON.stringify(plan.settings)}`,
    `Meeting kinds to make: ${plan.categories.map((c) => c.name).join(', ') || 'none'}`,
    `Meetings: ${plan.meetings.length}`,
    ...plan.meetings.map(
      (m) =>
        `  - [${m.category}] ${String(m.values.date)} ${String(m.values.start_time)} ${m.title}`,
    ),
    ...plan.lists.map(
      (l) =>
        `List ${l.existingSlug ?? l.name}: ${l.rows.length} rows${l.fields ? `, ${l.fields.length} new columns` : ''}`,
    ),
    'Notes:',
    ...plan.notes.map((n) => `  * ${n}`),
  ];
  return lines.join('\n');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const fileArg = process.argv.find((a) => a.endsWith('.json'));
  const env = loadEnv();
  const logger = createLogger('warn');

  // ---- read the old spreadsheet with the previous owner's access (read-only) ----
  const prev = await previousState(env.dataDir, fileArg);
  if (!prev.activeSpreadsheetId) throw new Error('The previous owner file has no spreadsheet.');
  const readOnly: StateStore = { read: async () => prev, write: async () => undefined };
  const oldAuth = new GoogleAuth(env, readOnly);
  const oldSheets = new LiveSheets({
    authClient: () => oldAuth.ownerClient(),
    onInvalidGrant: async () => {
      throw new Error(
        "The previous owner's Google access has expired. They need to sign in once more before the copy can run.",
      );
    },
  });
  const oldId = prev.activeSpreadsheetId;
  const tabs = await oldSheets.getTabs(oldId);
  const raw = await oldSheets.batchGet(
    oldId,
    tabs.map((t) => t.gid),
  );
  const byTitle = Object.fromEntries(tabs.map((t) => [t.title, raw[t.gid] ?? []]));
  const plan = buildPlan(byTitle, new Map(tabs.map((t) => [t.gid, t.title])));
  console.log(summary(plan));
  if (!apply) {
    console.log('\nNothing was written. Run again with --apply to copy.');
    return;
  }

  // ---- write into the current owner's database through the app ----
  const { google } = await createGoogleServices(env);
  const data = new DataLayer(google, { logger, appUrl: env.appUrl });
  const ctx = await data.use();
  const problems = await applyPlan(plan, ctx, { pauseMs: 3500, log: (l) => console.log(l) });
  if (problems.length > 0) {
    console.log('\nNot copied, with the reason:');
    for (const p of problems) console.log(`  ! ${p}`);
    process.exitCode = 1;
  } else console.log('\nEverything in the plan was copied.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
