# M5: Drive and Calendar, production-ready (MVP)

**Spec refs:** §5.7, §5.8, §9 rules 9 to 11, 20, §11, §13, §15 M5

## Goal

Make the M1 slice production-ready: file upload with pending and attached states, and full Calendar sync with retry.

## Scope

- Streamed multipart upload, MIME allow-list, size cap, sanitised names. Drive folders `/<Category>/<YYYY>/`, file name `YYYY-MM-DD — <title> — <original>`.
- `_files` as source of truth. The meeting's `files` cell mirrors view links, one per line.
- Pending to attached lifecycle, hourly job trashing pending files older than 24 hours, draft-restore file re-check.
- Calendar create, update, delete, restore, with reminders (max 5, at most 40320 minutes), extended properties, category colour mapping, deterministic event ids and the 409 restore path.
- `calendar_sync` states and the "Not on your calendar yet. [Try again]" chip. Retry job every 5 minutes.
- Failure rule: Sheet first, Calendar and Drive never block a save.

## Tasks

- [ ] `files` service and routes (`POST /files`, `DELETE /files/:id`)
- [ ] Add files UI in the meeting form and detail page
- [ ] `calendarSync.ts` with payload builder and tests
- [ ] Calendar hooks on create, update, reschedule, cancel, delete, restore, undo
- [ ] Sync-status chips and retry routes (`/calendar/retry/:id`, `/calendar/retry-all`)
- [ ] Background jobs with `node-cron`, last-run status in state file
- [ ] Failure-injection tests: `calendar`, `drive`, `network`

## Definition of done

- Creating a meeting puts an event on the calendar with reminders (about 10 s on a real account).
- Rescheduling moves it. Cancelling removes it. Restoring brings it back without a duplicate.
- A PDF uploaded in the form lands in Drive and its link appears in the Sheet and on the dashboard.
- A calendar failure still saves the meeting and shows the retry chip.
- Tag `m5-done`.
