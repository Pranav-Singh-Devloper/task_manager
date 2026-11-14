# Decisions

Format: date · decision · why · how to undo it.

## 2026-11-14

- **Spec reworded.** The two lines in SPEC.md that named the builder now say "the builder". Why: no tool names anywhere in the repo. Undo: edit lines 3 and 20.
- **Server compiles to CommonJS** (`tsconfig.server.json`, NodeNext, no `"type": "module"`). Why: code in `shared/` is imported by both the Next.js bundler and the server, and extensionless imports keep both happy. Undo: switch to ESM and add `.js` extensions.
- **Tailwind CSS v3**, not v4. Why: the design tokens map cleanly onto the stable v3 config. Undo: migrate with the official upgrade tool.
- **Noto Sans is self-hosted** through `@fontsource-variable/noto-sans` instead of `next/font/google`. Why: builds need no network, the font ships with the app, and it includes Devanagari for the Hindi UI. Undo: swap to `next/font`.
- **Dependencies** (all are in SPEC §4.1 unless noted): `next`, `react`, `express`, `next-intl`, `pino` (+`pino-pretty` for dev), `helmet`, `express-rate-limit` (used from M1/M7), `jose` (session cookie, M1), `zod`, `date-fns`, `date-fns-tz`, `ulid`, `node-cron` (jobs, M5), `dotenv` (load `.env`; not in §4.1, 1 line of code instead of hand parsing), `@radix-ui/react-dialog|radio-group|toast` (accessible primitives for the kit), `clsx` (class names), `@fontsource-variable/noto-sans`. Dev: `typescript`, `tsx`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `prettier`, `vitest`, `@playwright/test`, `@axe-core/playwright`.
- **`createDatabase` was built in M0**, not M1. Why: the mock Drive is pre-seeded with a real database layout so the whole UI can run without Google. M1's bootstrap adds discovery, Drive folders, migrations and state on top. Undo: none needed.
- **Live Google adapters batch their writes (to do in M1).** Creating about 21 tabs one call at a time could hit the 60 writes/minute quota. The interface is per-call; the live adapter should coalesce with `batchUpdate` and retry on 429.
- **Fake login and Sign out are deferred to M1.** Why: a Sign out button that does nothing breaks Rule Zero. The shell shows a demo user name until auth exists.
- **`/meetings/new` is a plain placeholder page** in M0 because the spec puts "+ New meeting" in the shell. It is replaced in M3.
- **Strict CSP with per-request nonce is deferred to M7.** M0 uses helmet defaults without CSP. Why: Next dev needs inline scripts and the nonce plumbing belongs with the hardening pass.
- **`/design` page** shows every UI kit component for size, contrast and keyboard checks. It is available in development and mock mode and returns 404 in live production.
- **Undo notices use Radix Toast** (10 s minimum, paused on hover and focus). Radix announces each notice through its own polite `role="status"` live region, so no extra role is added.
- **Demo data dates are relative to today**, in the configured timezone, so there are always upcoming and past meetings.

## 2026-11-14 (Google Cloud setup)

- **Google Cloud project "Meetings Manager" created** with the Sheets, Drive, Calendar and Gmail APIs enabled. Gmail is enabled now so the Phase 2 digest needs no further setup.
- **OAuth consent screen:** External, scopes `openid`, `userinfo.email`, `userinfo.profile`, `drive.file` and `calendar.events`. `gmail.send` is not added yet; it is requested later through incremental consent (SPEC §5.2).
- **OAuth client:** Web application with one redirect URI, `http://localhost:3000/api/auth/google/callback`. The client ID and secret live only in the git-ignored `.env`. The secret cannot be viewed again in the console; if lost, create a new one in Google Auth Platform, then Clients. Undo: delete the client in the console.
- **`GOOGLE_MODE` stays `mock` in `.env`** until the live adapters exist (M1).
- **The app is in Testing mode, not yet published.** Why: Google requires a homepage URL and a privacy policy URL before an external app can be published, and there is no production domain yet. While in Testing, the owner's refresh token expires after 7 days (SPEC §5.1). Only the owner's Google account is listed as a test user. To finish: deploy, add the production redirect URI to the client, fill in Branding with the homepage and privacy policy links, then click Publish app on the Audience page.

## 2026-11-14 (M1)

- **`proxy.ts` instead of `middleware.ts`.** Next 16 renamed the route guard file. It does what SPEC §5.3 describes: sends signed-out visitors to /login and keeps the 30-day session sliding. Undo: rename back on an older Next.
- **Sign-in rate limit covers only starting a sign-in and the callback** (30 a minute). The shell calls `/api/auth/me` on every page load, and limiting it tightly locked people out during testing. Undo: widen or narrow the two limits in `routes/auth.ts`.
- **Mock sign-in is `GET /api/auth/google?as=email`.** Why: the allow-list, wrong-account and not-set-up paths can be tested without Google. It exists only when `GOOGLE_MODE=mock`.
- **Batched Sheets calls** (`addTabs`, `writeBlocks`, `formatTabs`) are in the interface. Creating the whole database takes 4 calls instead of about 65, which settles the quota worry noted earlier.
- **Calendar payload builder, insert-or-restore, upload allow-list and safe names were written in M1**, not M5, because the working slice needs them. M5 adds category colours, the retry job and the sync chips.
- **Config row parsing and "skip and report" were written in M1** for `/api/meta`. M2 adds the deeper checks (formulas, duplicate keys across tabs) and the Zod generation.
- **Uploads use the Google client's streamed multipart upload**, not a resumable session. Why: it streams without holding the file in memory and the limit is 50 MB. Undo: switch `LiveDrive.uploadFile` to a resumable upload if large files fail.
- **`/spike` is a temporary page** for the working slice. It is not in the menu and is removed when the real meeting form lands in M3.
- **A user who unticks Calendar or Drive on Google's permission screen** gets a plain message asking them to sign in again with both ticked, and nothing is saved.
- **The live Google adapters are covered by tests of their pure parts** (retries, error mapping, A1 quoting, format requests, Drive queries) and by the mock adapters sharing the same interfaces. They have not yet been run against real Google. See the open items below.

## 2026-11-14 (M3)

- **"Not decided yet" is stored in a new `awaiting_next` system column.** It is TRUE only for a done meeting in a category that has a case key and whose next date is not decided; it is cleared when a next meeting is scheduled. For other categories "Not decided yet" counts as No (§7.6). An existing database gets the extra column appended to each category tab the first time it is loaded, and it is visible in the Sheet (new tabs hide their system columns when they are created).
- **Adding files is not in the form or on the meeting page yet.** The spec lists it, but file upload is M5, and Rule Zero says nothing unbuilt is shown. Files, Add file and the Calendar status line arrive with M5.
- **After saving, the notice says "Meeting saved."**, not "...and added to your Google Calendar". Calendar sync is M5; the message changes then.
- **Returning after a reschedule goes to an explicit place, not the browser's back.** It is the meeting by default, or any in-app path passed as `?return=`, which the dashboard will use in M4. Going "back" in the browser could leave the app when the page was opened directly.
- **The done page has no default answer.** The person must choose Yes, No or Not decided yet. It costs one tap but prevents closing a case without ever deciding about the next date. Undo: set a default in `done-screen.tsx`.
- **"Same time next week" keeps the weekday of the original meeting and is always in the future**: one week after the original, or the next such weekday if that has passed. "Same time tomorrow" is tomorrow. Both only fill in the fields; nothing is saved until Save.
- **A second next meeting asks first**, with Open existing and Create another anyway. A Replace button was left out: it would delete a meeting, which is a bigger step than the page should hide behind one tap.
- **Reminders are stored blank when the person leaves the default ticks**, so changing the default in Settings changes every meeting that uses it (§6.5). Only a different choice is saved on the meeting.
- **Dropdown learning counts a value each time it is used or changed**, not on unrelated edits. A different spelling of an existing value reuses it. The 36 states and other fixed lists never learn.
- **Cancel on a form keeps the draft.** An accidental tap on Cancel should not cost typing; the draft is offered back (Restore or Discard) the next time.
- **New categories can be added by anyone signed in**, from the picker. The category gets the core columns, the first workspace as its default, and a tab named after it (with a number added if the name is taken).
- **Sidebar "+ New meeting" button** has less side padding than other large buttons so the label stays on one line in 240 px.
- **TanStack Query** is used for screen data with a 30 second stale time (SPEC §4.1), so moving between screens is quick and a change refreshes what is on screen.
- **Until the Trash page exists (M6), a deleted meeting can only be brought back with Undo (10 minutes) or its direct link.** The delete confirmation says "You can bring it back from Trash" as the spec requires, which becomes fully true in M6.
- **The first-time-user test is automated as a timed run** (create, reschedule, mark done with a next date, under 90 seconds). The real test with a person who has never seen the app is still for the maintainer to run.

## 2026-11-14 (M2)

- **One guarded path changes a meeting row.** It takes the tab's lock, re-reads the live row, checks the id cell is where the cache says (re-indexing the tab if the owner sorted the Sheet), checks the rev, validates, writes, updates the cache, then logs. Reading the live row also means a stale cache can never overwrite a newer Sheet edit.
- **Undo is an inverse change, with in-memory tokens.** Tokens last 10 minutes and work once, and they are lost if the server restarts. Why: the change itself is already saved, so nothing is lost; only the Undo button goes away. Undo of a create moves the meeting to Trash, as the spec says.
- **Logging is best effort.** The change is already saved when it is logged, so a Sheets hiccup in `_audit` is counted (for System health) and not turned into a failed save.
- **A Sheet edit to a date or time is noticed only after the first load in a running server.** The app cannot know what a date was before it first looked. A date edited while the server was off is simply read as the truth. Undo: none needed.
- **Hand-typed rows are adopted; copied rows get a fresh id.** A row with no id and a readable date becomes a meeting. A row that repeats another row's id (copy and paste) gets a new id. A row with no readable date is left alone and listed as "needs attention".
- **Calculated columns are not stored.** The Sheet shows them blank, with a note on the header. They are worked out on read, and can only use stored columns, never each other, so a loop is impossible.
- **Blank and missing mean the same thing in validation.** Every active field is passed to Zod explicitly (null when absent), because Zod 4 treats a missing key as invalid when the field has a transform.
- **`calendar_sync` is set to `pending` when a change touches the Calendar event** (time, topic, link, reminders, details, status, or a title field), and left for M5 to act on. M2 never talks to Calendar.
- **`GET /meetings` is basic** (scope, category, workspace, status). Search, filters, sorting and paging arrive with the dashboard in M4.
- **A Google outage is a 503 saying "Your changes are still here"**, and a dead sign-in is a 401 `needs_sign_in`. Both are mapped in one place in `app.ts`.
- **`/api/meta` reports `problems` (skipped config rows) and `attention` (unreadable cells)** so System health in M6 can show them without new plumbing.
- **Learning dropdowns (§9 rule 18) move to M3**, where the form's "Add xyz" row exists. Clash detection stays in Phase 2.
- **Settings changes reload the cache** instead of patching it, because they are rare and a reload is always correct.

## 2026-11-14 ([Verify] results from a real Google account)

Run against the owner's own Google account in live mode. Test data (a calendar event, a file and two Sheet rows) was removed afterwards.

- **Sheets read and write work with `drive.file` alone.** The app created the spreadsheet, 21 tabs and the seed config, and read them back. The broader `spreadsheets` scope is not needed and is not requested.
- **Text that looks like a formula stays text.** `=1+1`, `+SUM(1)`, `@x` and `-5` were written with RAW input and read back unchanged.
- **Calendar event with a custom id works.** The id `mm` + 32 hex characters was accepted.
- **Reusing an id gives 409**, both while the event exists and after it has been deleted.
- **After a delete, `events.get` still returns the event with `status: cancelled`.** Restoring works with `events.update` and `status: confirmed`: the same event came back confirmed and no second event was made. This is the path `upsertEvent` uses.
- **`files.copy` does NOT keep `appProperties`.** The copy came back with none. Setting `role: backup` explicitly on every copy (which `copyFile` does) is therefore required. With a backup present, the database search still found exactly one database.
- **A restart needs no new sign-in.** A separate process with only the state file used the saved token. A full server restart left the browser signed in and `/api/meta` returned the real 11 categories and 155 fields.
- **A lost state file recovers.** With the file removed, the dashboard showed "Please sign in with Google again." After signing in, the app found the same spreadsheet. There was still exactly one database in Drive.
- **First sign-in and re-sign-in behave as designed.** First time: account chooser, then the "unverified app" screen, then a permission screen where Google lets the person tick Drive and Calendar separately (both start unticked), then back to the app. After the token was lost, the app asked for consent again and Google answered "already has some access".
- **The working slice works in real Google.** One meeting made a Sheet row (dates stored as text so they sort), a Calendar event with reminders at 1 day and 1 hour, a link back to the app in the event, and a PDF in `Meetings Manager / Others / 2027 /` with its link in the row and in `_files`. Saving the same meeting again returned "existing" on the same row.

### Still open

- **Popup reminders arriving on a phone** cannot be checked from a computer. The event was confirmed to hold reminders at 1440 and 60 minutes. The owner should create a real meeting a couple of days ahead and see that the phone notifies.
- **Publishing the app** (see the Google Cloud setup entry above).

## 2026-11-14 (M4: Dashboard)

- **Filters, sort, tab and view live in the URL.** A filtered list can be bookmarked or sent to someone. Table or Calendar, the columns chosen, and Upcoming or Past are also remembered per device.
- **Search and filters run on the server's cached copy.** Search looks at every text field plus title, category, workspace and file names. Paging is 50 rows with "Show more".
- **One set of filter rules is shared** (`shared/filters.ts`) by the server and the filter builder, so the table, the calendar and the count always agree.
- **The calendar shows the same filtered set as the table.** Its visible window is intersected with the Dates control, so the two never disagree about what is in range.
- **The sticky header applies only from tablet width up.** On a phone at the largest text size it used 513 of 844 pixels, which left no room to read.
- **Other-month days are readable.** FullCalendar fades them below the contrast we require, so they are drawn at full strength. Day cells lose FullCalendar's `aria-labelledby`, which did not match the visible text. The "+n more" link gets a button role, because it opens a list.
- **Calendar and table library majors are pinned** (TanStack Table 8, FullCalendar 6). The newest majors installed by default changed the APIs we use.
- **Left for M5:** the Files column (nothing to show until uploads exist) and the "calendar not synced" attention line.
- **Not built yet:** a "Stop waiting for the next date" button on the meeting detail page. The server route exists (`POST /meetings/:id/dismiss-waiting`). It is added with the other detail-page actions.
- **No drag to reschedule in the calendar**, as the spec says. Rescheduling stays the three-tap page.
