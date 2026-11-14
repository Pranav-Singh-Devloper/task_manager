# Meetings & Tasks Manager: Product & Technical Spec

**Version:** 2.0 · **Date:** 14 Nov 2026 · **Audience:** the builder
**Stack:** Next.js (React) + Express, TypeScript, Google Sheets as the database, Google OAuth 2.0

---

## 0. How to use this document

1. Save this file as `SPEC.md` at the repo root. Read all of it before writing code. Build in the milestone order in **§15**. Each milestone has a Definition of Done.
2. **Rule Zero (§3) overrides everything**, including other parts of this spec. If a feature makes the UI more complex for the primary user, simplify it or cut it.
3. Tags used throughout:
   - **MVP** = Phase 1, ships first. **P2** = Phase 2. **P3** = Phase 3.
   - **[Assumed]** = an assumption. Build with the stated default and make it easy to change.
   - **[Open]** = needs confirmation from the requester (collected in §16). Never block on these.
   - **[Verify]** = a Google API behaviour that you must prove in the M1 spike (§15) before you build on it. If it fails, find a workaround that keeps the described behaviour and record it in `DECISIONS.md`.
4. "Must" and "never" are hard requirements. "Should" means use your judgement.
5. Ask the requester only when something truly blocks you. Otherwise pick the simplest option that satisfies Rule Zero and record the decision in `DECISIONS.md`.

### 0.1 Working agreement (for the builder)

- **Build a working slice before adding breadth.** The riskiest part of this project is the Google integration, not the React UI. M1 ends with one real meeting going App → Sheet → Calendar → Drive in live mode. Don't polish the UI before that works.
- **Cut, don't pad.** Don't build features from later milestones early. The UI never shows unbuilt features (no greyed-out or "coming soon" buttons). Hide them until they exist.
- **Dependencies:** use the libraries in §4.1. Any new dependency needs a one-line reason in `DECISIONS.md`.
- **`DECISIONS.md` entries:** date · decision · why · how to undo it.
- **Commits:** small, one concern each. Each milestone ends with a tagged commit (`m0-done`, `m1-done`, …).
- **Stop and ask** only if: a [Verify] item fails and no workaround keeps the spec's behaviour; a requirement contradicts Rule Zero and has no obvious simplification; or a change would put existing data at risk.
- **Strings:** every user-facing string goes through the i18n layer (`next-intl`, `messages/en.json`) from M0. Components contain no hard-coded user-facing text. This keeps the P3 Hindi UI a translation job instead of a rewrite.

---

## 1. Context

- **Primary user:** the requester's father, a senior officer at **NHAI** (National Highways Authority of India) who is **also pursuing a PhD**. He is older, so assume low tolerance for complex or fancy UI. He is based in Delhi (IST) and will use both a phone and a desktop/laptop.
- **Requester / maintainer:** his son, who builds and maintains the app. He wants the father (or himself) to be able to change columns, categories and options **without a developer**.
- **The problem:** the father has many kinds of meetings (conciliation, ministry, finance committees, court cases, file discussions, award targets, PhD). Each kind tracks different information. Meetings are rescheduled constantly. He needs one place to enter, find and reschedule them, with phone reminders and linked documents.
- **Why Google Sheets as the database:** the father can see and edit the data in a spreadsheet he already understands. The data stays in his own Google account, and there is no database server to run.
- **Why Google OAuth:** one sign-in gives access to Sheets (data), Drive (documents) and Calendar (reminders on his phone), all in the same Google account.

### 1.1 The core loop (prioritise everything around this)

**Plan → Get reminded → Attend → Record the outcome and the next date.**

Court cases, conciliation and committee work run as a series: each sitting ends with a "next date". If recording the outcome and the next date is quick, the app becomes his daily habit. Every other feature supports this loop.

### 1.2 Goals

- Enter a meeting in under 90 seconds on a phone, with the right fields for its category.
- Reschedule a meeting in 3 taps. The Google Calendar event, the Sheet and the dashboard all update.
- **Close a meeting in under 30 seconds:** mark it done, add notes (optional) and set the next date. The next meeting is created and placed on his calendar.
- See all upcoming meetings in date order, as a table or a calendar, with past meetings in a separate tab.
- Search, sort and filter on any field.
- Attach documents to a meeting. They are saved to his Google Drive, and the view link appears in the Sheet and on the dashboard.
- A fully flexible schema, managed from an admin panel: add, rename, hide and reorder columns and categories; set fields as required or optional; manage dropdown options.
- An Excel-like raw view of every table.

### 1.3 Non-goals (do not build)

Multi-tenant SaaS, native mobile apps, Outlook/Microsoft calendar, document editing inside the app, AI features, dark mode, offline *writes*, undated meetings (every meeting has a date and a start time).

### 1.4 Glossary (NHAI context)

Treat category names as opaque labels. The expansions below are for understanding only. Items marked "unverified" are guesses (**[Open]**).

| Term | Meaning |
|---|---|
| NHAI | National Highways Authority of India |
| CCIE | Conciliation Meetings (Conciliation Committee of Independent Experts, unverified expansion) |
| SFC / PPPAC | Standing Finance Committee / Public Private Partnership Appraisal Committee (unverified) |
| MORTH | Ministry of Road Transport and Highways |
| PMG | Project Monitoring Group (unverified) |
| PATSC / IAC | Do not expand. Opaque label. |
| AT | Award Target (given by the requester) |
| UPC | Unique Project Code (unverified) |
| PIU | Project Implementation Unit (unverified) |
| RO | Regional Office (unverified) |
| AE / IE | Authority's Engineer / Independent Engineer (unverified) |
| BDD | Bid Due Date (given by the requester) |

---

## 2. Product summary

A single-user web app that works well on mobile and desktop. The father:

1. Signs in with Google.
2. Lands on a **dashboard of upcoming meetings** (table or calendar view; Upcoming / Past tabs).
3. Taps **+ New meeting**, picks a **category** and fills in a form specific to that category.
4. The meeting is saved as a row in a Google Sheet (one tab per category) and added to his Google Calendar with reminders. Attached files go to Google Drive.
5. Can change a meeting's date or time at any point. Every change is recorded.
6. After a meeting, taps **Mark as done**, adds notes (optional) and sets the **next date** if there is one.
7. Can open the **Admin** area to see the raw tables like Excel and change the structure of any category.

---

## 3. RULE ZERO: UI/UX (non-negotiable)

> The UI must be **super simple**: nothing complex, nothing fancy. It must look good on web and mobile.

These requirements are testable.

**Layout & navigation**
- **Left-side navigation bar** on screens ≥ 768 px (fixed, 240 px wide). On mobile (< 768 px) it becomes a **left slide-in drawer**, opened by a labelled **"Menu"** button (text + icon).
- The sidebar has at most 5 text-labelled items, with the current page highlighted: **Dashboard · Tasks · Cases · Admin · Settings**. **Only show items whose phase has been built** (MVP shows Dashboard, Admin, Settings). A large **"+ New meeting"** button sits at the top of the sidebar. On mobile it also appears as a floating button, bottom-right, with its label visible.
- No dropdown menus in navigation and no overflow "⋯" menus. Every action is a visible, labelled button.
- No modal on top of a modal. Dialogs are only for short confirmations. **Every form is a full page, not a popup. This includes Reschedule and Mark as done.**

**Readability & touch**
- Base font **18 px** minimum. Headings 24–32 px. Font: **Noto Sans** (supports Devanagari for the future Hindi UI), fallback `system-ui`.
- **Text size control** in the top bar: three buttons **A / A+ / A++** (100% / 125% / 150%), persisted. Layouts must not break at 150%.
- Every tap target is at least **48 × 48 px**, with at least 8 px spacing.
- Contrast: body text ≥ **7:1**, UI components ≥ 4.5:1. A **High contrast** toggle (in Settings and the top bar) switches to pure black on white with 3 px borders.
- Colour is **never the only signal**. Category and status always include a text label.
- No hover-only actions, right-click, swipe-only, long-press or drag-only interactions in the MVP.
- Respect `prefers-reduced-motion`. No animation beyond 150 ms fades.

**Language & content**
- Plain words. Use "Meeting", "Reschedule", "Add file", "Save". Never "sync", "payload", "entity", "error 500".
- Errors say **what happened + what to do + a button**. Example: "We couldn't reach Google Calendar. Your meeting is saved. [Try again]".
- Dates as `Mon, 17 Nov 2026`; times as `10:30 AM`; use "Today" / "Tomorrow" where applicable. **Never show ISO strings or IDs** in the main UI (only in Admin).
- Destructive actions use a plain confirmation: "Delete this meeting? You can bring it back from Trash." Every delete, cancel, reschedule and "mark done" also shows an **Undo** notice that stays for at least 10 seconds (`role="status"`; it doesn't disappear while focused).
- Loading states are text ("Loading your meetings…"), never a blank screen.

**Visual style**
- White or very light grey background, near-black text, **one accent colour** (deep blue, e.g. `#1E40AF`). A fixed accessible palette for categories (10 colours) and statuses.
- One **primary** button per screen (filled, large, labelled). Other actions are outlined.
- Mobile: tables become **card lists** (large date/time, title, category chip, status, and "Join" and "Files" buttons).

**Admin exception:** Admin (§7.9) is a power-user area, mainly for the maintainer. It is **desktop-first**. On screens < 768 px it opens with the notice "Admin works best on a computer. [Continue anyway]". The rules above still apply to its buttons, text and contrast.

**Acceptance test ("first-time user test"):** someone who has never seen the app can create a meeting, find it, reschedule it, and mark it done with a next date in under 90 seconds without help. Run this check at the end of every UI milestone.

---

## 4. Technical architecture

### 4.1 Stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict mode) |
| Frontend | **Next.js** (App Router) + React, Tailwind CSS, Radix UI primitives (shadcn/ui style, enlarged to meet Rule Zero) |
| Backend | **Express** (TypeScript) hosting the Next.js app (custom server) |
| i18n | `next-intl`, English only until P3 |
| Data fetching | TanStack Query (staleTime ~30 s, optimistic updates) |
| Tables | TanStack Table for the dashboard; **AG Grid Community** for the editable Admin grid |
| Calendar UI | FullCalendar (daygrid, timegrid, list plugins) |
| Validation | Zod schemas, **generated from the field config at runtime** |
| Google | `googleapis` (Sheets v4, Drive v3, Calendar v3, Gmail v1), `google-auth-library` |
| Dates | `date-fns` + `date-fns-tz`. All times are interpreted in the configured timezone (default `Asia/Kolkata`) |
| IDs | ULID |
| Jobs | `node-cron` (in-process) |
| Logging | `pino` (structured JSON) |
| Security | `helmet`, `express-rate-limit`, `jose` |
| Tests | Vitest (unit), Playwright + `@axe-core/playwright` (e2e + accessibility) |

### 4.2 Process model: one Node process

Run **Express as a custom server that also serves Next.js** (`next({ dev })` → `app.prepare()` → `server.all('*', handle)`). API routes live under `/api/*` in Express; pages are Next.js.

Why: Sheets has strict quotas, so the app needs a **long-lived in-memory cache** and **scheduled jobs** (calendar retry, backups, digest). Neither works well on serverless platforms.

Hard requirements that follow:
- **Deploy to a persistent, always-on Node host** (Railway, Render paid instance, Fly.io, or a small VPS behind Caddy/nginx). **Not Vercel serverless, and not any free tier that sleeps.** Jobs and reminders-retry stop while the app sleeps.
- **A persistent disk/volume mounted at `DATA_DIR`** (see §4.3).
- **Run exactly one instance.** The cache and write locks are in-process.
- Set `TZ=UTC` on the host. Code never relies on server local time (§4.6).
- HTTPS and a stable domain are required for the OAuth redirect (localhost is allowed in development).
- Health check at `GET /api/health`.

### 4.3 Local state file (`DATA_DIR/state.json`)

The server needs the owner's refresh token **before** it can talk to Google. Storing it only inside the spreadsheet would mean that after every restart the server couldn't read the token, because reading the Sheet requires the token. So the token lives on local disk.

`state.json` holds:
- the owner's refresh token, **encrypted** (AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY`)
- `activeSpreadsheetId`, `driveRootFolderId`, `driveBackupsFolderId`
- the last run time and result of each background job (shown in Admin → System health)

Write it atomically (write a temp file, `fsync`, rename). Never log it, and never send it to the client.

**If the file is missing or unreadable** (new host, lost volume): background jobs pause, and the app shows "Please sign in with Google again. [Sign in]". The owner's next sign-in rebuilds the file and finds the database again (§5.5). No data is lost, because all data lives in Google.

### 4.4 Repo layout

```
/
├─ SPEC.md, DECISIONS.md, README.md
├─ docs/MAINTAINER.md        # how to: add a category, restore a backup, rotate keys, move hosts
├─ messages/en.json          # all user-facing strings
├─ app/                      # Next.js App Router
│  ├─ (auth)/login
│  └─ (app)/ page.tsx (= dashboard at "/"), meetings/new, meetings/[id],
│            meetings/[id]/(edit|reschedule|done), tasks, cases/[caseId],
│            admin/(data|columns|trash|log|backups|health), settings, print/week
├─ components/               # UI kit (Button, Input, Select, RadioChips, Combobox, Chip, Card, Dialog, Toast, FormField…)
├─ server/
│  ├─ index.ts               # Express + Next custom server
│  ├─ routes/                # auth, meta, meetings, tasks, files, cases, admin, calendar, settings, undo
│  ├─ services/
│  │  ├─ google/             # auth.ts, sheets.ts, drive.ts, calendar.ts, gmail.ts  (+ mock/ adapters)
│  │  ├─ config.ts           # categories/fields/workspaces/settings + config validation
│  │  ├─ meetings.ts, tasks.ts, files.ts, cases.ts
│  │  ├─ schema.ts           # builds Zod validators from field config
│  │  ├─ audit.ts, undo.ts, reschedule.ts, calendarSync.ts, backup.ts, digest.ts, health.ts
│  │  ├─ state.ts            # DATA_DIR/state.json read/write
│  │  └─ bootstrap.ts        # first run: create sheet, folders, seed data, migrations
│  └─ lib/                   # cache, mutex, crypto, backoff, dates
├─ shared/                   # types, field-type definitions, formula engine (also used by the client for previews)
└─ tests/                    # unit, integration, e2e
```

Scripts: `dev` (tsx watch → boots Next in dev, `GOOGLE_MODE=mock` by default), `build` (`next build` + `tsc -p server`), `start` (`node dist/server/index.js`), `test`, `test:e2e`, `lint`, `typecheck`.

### 4.5 Adapters and mock mode (important for development)

Define the interfaces `SheetsRepo`, `DriveClient`, `CalendarClient`, `MailClient`, `StateStore`, each with **two implementations**:
- `GOOGLE_MODE=live`: real Google APIs.
- `GOOGLE_MODE=mock`: an in-memory/JSON-file implementation, seeded with realistic demo data for every category, plus a fake login and fake Drive/Calendar. **The entire UI must be buildable and testable in mock mode without any Google credentials.** Playwright tests run in mock mode.
- **Failure injection:** `MOCK_FAIL=calendar,drive,sheets429,network` makes the mocks fail in those ways, so every error path in §11 can be tested and demoed.

### 4.6 Caching, concurrency, quotas, time

- The Sheets quota is limited (roughly 60 reads/min/user and 60 writes/min/user). **Never read from Sheets once per request.**
- On startup and after any write, load all data tabs into an in-memory cache with a single `values.batchGet`. TTL **30 s**, plus a "Refresh" button that forces a reload. The cache is **write-through**: writes go to Sheets first, then update the cache.
- Search, filter and sort run **in memory on the server** (expected size: a few thousand rows). The client debounces search input by 250 ms.
- **Write queue + mutex per tab.** Writes are serialised. Use exponential backoff with jitter on 429 and 5xx responses.
- **Optimistic concurrency:** every row has a `rev` number. `PATCH` must send the `rev` it saw. On a mismatch, return **409**: "This meeting was changed somewhere else. [Reload]".
- **Never trust a cached row location.** The father (or Sheets) may sort or edit the sheet directly. Before updating a row, inside the tab's mutex, re-read the `id` cell at the cached row index. If it doesn't match, re-index the tab and retry once.
- **Tolerant reader:** accept dates typed by people (`17/11/2026`, `17-Nov-2026`, Sheets date serials) and normalise them to ISO on the next write. Never crash on a malformed cell; show a small "needs attention" marker instead.
- **Adopting hand-typed rows:** a row in a category tab with a parseable date but no `id` (the father typed it straight into the Sheet) is adopted on the next refresh. The app assigns `id`, `rev` and `created_at`, writes them back, creates the calendar event if the meeting is upcoming, and logs an audit entry with source `sheet`.
- **Idempotent creates:** `POST /meetings` takes a client-generated `id`. If that id already exists, return the existing meeting (200) instead of creating a duplicate, so a save retried after a network failure never creates two meetings.
- **Time:** "now" and "today" are always computed in the configured timezone, never in the server's local time. Unit tests run with `TZ=America/Los_Angeles` to catch any leak.

---

## 5. Google integration

### 5.1 Google Cloud setup (document these steps in the README, with screenshots)

1. Create a Cloud project. Enable the **Google Sheets API, Google Drive API, Google Calendar API, and Gmail API (P2 digest)**.
2. OAuth consent screen: app name, support email, the scopes below. **Publish to "In production".** In *Testing* mode, refresh tokens expire after 7 days, which would log the father out every week. An unverified app shows a one-time "unverified app" screen (Advanced → Continue) and is capped at 100 users, which is fine here. **The README tells the requester to do the father's first sign-in with him, because that screen looks alarming.**
3. Create an OAuth client of type **Web application**. Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback` and the production URL.
4. Put the credentials in env vars (§14).

### 5.2 Scopes (request the minimum)

| Scope | Who | Why |
|---|---|---|
| `openid email profile` | everyone | identify the user |
| `https://www.googleapis.com/auth/drive.file` | owner only | create and manage **only the files this app creates** (the database spreadsheet, uploaded documents, backups). Avoids full-Drive access. |
| `https://www.googleapis.com/auth/calendar.events` | owner only | create, update and delete meeting events on his calendar |
| `https://www.googleapis.com/auth/gmail.send` | owner only, **P2** | morning digest email. Requested later through incremental consent, only when the father turns the digest on. |

Non-owner users (e.g. the requester) are only asked for `openid email profile`. All data access goes through the owner's token (§5.4).

**[Verify] in M1:** Sheets API read/write works on the app-created spreadsheet with `drive.file` alone. Only add the broader `spreadsheets` scope if that is proven necessary, and record the reason in `DECISIONS.md`.

### 5.3 Auth flow (server-side authorization-code flow with PKCE)

- `GET /api/auth/google` → redirect with `access_type=offline`, `include_granted_scopes=true`, `state` (CSRF) and a PKCE challenge.
  - Use `prompt=consent` **only** when the owner is signing in and there is no stored refresh token or a required scope is missing. Otherwise use `prompt=select_account`, so the father doesn't see the consent screen on every sign-in.
- `GET /api/auth/google/callback` → exchange the code, verify the ID token, and check the email against `ALLOWED_EMAILS`.
  - Not allowed: "You signed in as *x@gmail.com*. This app is set up for a different Google account. [Use a different account]".
  - An allowed non-owner signs in before the owner has ever signed in: "The app isn't set up yet. [Owner name] needs to sign in once first."
- **Session:** a signed JWT (HS256, `jose`) in an `httpOnly`, `Secure`, `SameSite=Lax` cookie with a 30-day sliding expiry. Contains `sub`, `email`, `role` (`owner|admin`).
- Next.js `middleware.ts` verifies the cookie and redirects unauthenticated users to `/login`. The login page has **one big button: "Sign in with Google"**.

### 5.4 Owner-token model

The server makes every Google call (Sheets, Drive, Calendar, Gmail) **using the owner's tokens** (`OWNER_EMAIL`), never the visiting user's. This keeps a single data owner and lets background jobs run without a browser session. It also makes P3 assistant access possible: the assistant signs in only to *this app*, and the app acts through the owner's token.

- The refresh token is stored encrypted in `DATA_DIR/state.json` (§4.3). It is never sent to the client and never logged. Access tokens are kept only in memory.
- If a refresh fails with `invalid_grant`: pause background jobs and show the banner "Please sign in with Google again. [Sign in]" to every signed-in user. No data is lost.

### 5.5 First-run bootstrap (`bootstrap.ts`, idempotent)

On the owner's successful sign-in, if the state file has no working `activeSpreadsheetId`:

1. **Find the database**, in this order:
   1. `SPREADSHEET_ID` env var, if set.
   2. A Drive search: `appProperties has { key='app' and value='meetings-manager' } and appProperties has { key='role' and value='database' } and trashed = false`. This works under `drive.file`. If more than one file matches, use the most recently modified and show a warning in Admin → System health.
2. If no database exists: create a spreadsheet named **"Meetings Manager — Database"** with `appProperties = { app: 'meetings-manager', role: 'database' }`. Create all tabs (§6) and seed config (§6.7). Apply sheet formatting: frozen header row, hidden system columns, header protection with `warningOnly`, and a note on each computed column header saying "Calculated in the app".
3. Create the Drive folder **"Meetings Manager"**, with sub-folders created on demand as `/<Category>/<YYYY>/`, plus `Backups/`.
4. Run **schema migrations** (`schema_version` in `_system`). Every migration must be idempotent.
5. Save the ids to the state file.

### 5.6 Sheets I/O rules

- Tabs are referenced by **`sheetId` (gid)**, stored in config, **not by tab name**, so the father can rename a tab without breaking anything.
- Writes use `valueInputOption=RAW`. User text starting with `=`, `+`, `-` or `@` is stored as literal text and never evaluated as a formula. Exports (CSV/XLSX) must also neutralise those prefixes.
- Row 1 of every data tab holds the **field keys** (stable, snake_case). Labels live in config, so renaming a label never touches the data.
- Adding a column appends a header and grows the grid if needed. Removing a column **archives** it (§9 rule 12); it is never physically deleted unless explicitly purged.
- Dates are stored as ISO `YYYY-MM-DD` and times as `HH:mm` (24 h). These sort correctly even as text when the father sorts the Sheet. The UI always renders friendly formats. Numbers are stored as numbers, booleans as `TRUE`/`FALSE`, and multi-selects as comma-separated text.

### 5.7 Drive (file upload)

- Browser → Express (multipart, streamed) → Drive resumable upload. Size limit `MAX_UPLOAD_MB` (default 50). Allow-listed MIME types: PDF, Office docs, images, text, CSV, zip.
- Drive path: `Meetings Manager/<Category>/<YYYY>/`. File name: `YYYY-MM-DD — <title> — <original name>`.
- Files stay **private to the owner**. Store `webViewLink` as the view link.
- **Uploading while entering a meeting:** the form generates the meeting `id` (ULID) on the client when it opens. Uploads attach to that id as *pending* and become *attached* when the meeting is saved. A job trashes pending files older than 24 h. When a saved draft is restored, the app re-checks its files; any that expired show "This file needs to be added again. [Add file]".
- The `_files` tab is the source of truth for files. The meeting's `files` cell holds human-readable view links (one per line), so the raw Sheet is useful on its own. Removing a file in the app detaches it and moves it to the Drive trash (recoverable for 30 days).

### 5.8 Calendar sync

On meeting **create / update / reschedule / cancel / delete / restore / undo**:

1. **Save to the Sheet first.** A Calendar failure must never block a save.
2. Then call Calendar. On success, set `calendar_sync = ok` and store `calendar_event_id`. On failure, set `calendar_sync = error`. A job retries every 5 minutes, and the UI shows the chip "Not on your calendar yet. [Try again]".

**Deterministic event IDs (prevents duplicate events):** the event id is `"mm" + lowercase hex of the meeting ULID's 16 bytes` (34 characters, all valid base32hex). Pass it as the `id` on `events.insert`.
- If an insert times out, the retry reuses the same id, so a lost response can never create a second event.
- **[Verify]** If an insert returns **409** (the id has been used before, e.g. the meeting was cancelled and is now restored), `events.get` that id and then `events.update` it with the full payload and `status: "confirmed"`. Restoring works this way.

Event payload:

```json
{
  "id": "mm<32 hex chars>",
  "summary": "[CCIE] <title>",
  "description": "<key details>\n\nOpen in app: <APP_URL>/meetings/<id>\nFiles:\n<drive links>\nMeeting link: <url>",
  "start": { "dateTime": "2026-11-17T10:30:00", "timeZone": "Asia/Kolkata" },
  "end":   { "dateTime": "2026-11-17T11:30:00", "timeZone": "Asia/Kolkata" },
  "location": "<meeting link if URL>",
  "reminders": { "useDefault": false, "overrides": [
      { "method": "popup", "minutes": 1440 }, { "method": "popup", "minutes": 60 } ] },
  "extendedProperties": { "private": { "mmMeetingId": "<id>", "mmCategory": "ccie" } },
  "colorId": "<mapped from category>"
}
```

- Cancelled → **delete** the event (the row stays, with status Cancelled). Restored → handled by the 409 path above.
- Reminders come from the meeting's `reminder_minutes`, falling back to the global default setting (1 day before + 1 hour before). Calendar allows **at most 5 reminders, each ≤ 40320 minutes (4 weeks)**. Validate against these limits.
- Calendar has 11 event colours. Map categories to them and reuse colours after 11 (category names are always in the summary anyway).
- The calendar used is `primary` by default (a setting). Phone reminders work because the father's phone already syncs his primary Google Calendar.
- **P2, two-way sync:** poll `events.list` with a `syncToken` every 10 minutes and on dashboard load, filtered by `privateExtendedProperty=mmMeetingId`. If an event was moved on the phone, update the row and log a reschedule with source `calendar`. If it was deleted on the phone, do **not** cancel the meeting automatically. Clear `calendar_event_id` and show "Removed from calendar. [Add back]".

### 5.9 Gmail digest (P2)

See §7.10. Sent through the Gmail API from the owner to the owner, using incremental consent for `gmail.send`.

---

## 6. Data model (Google Sheets)

There is one spreadsheet. **Each data table is a tab.** Config and log tab names start with `_`.

### 6.1 Tabs

| Tab | Purpose |
|---|---|
| One tab **per category** (`CCIE`, `SFC_PPPAC`, `MORTH`, `PMG`, `PATSC_IAC`, `File Discussion`, `AT`, `Court Case`, `Others`, …) | meeting rows |
| `Tasks` | action items and tasks |
| `_categories` | category definitions |
| `_fields` | field (column) definitions for every category |
| `_workspaces` | NHAI / PhD / Personal |
| `_settings` | global key/value settings |
| `_files` | uploaded file records |
| `_reschedules` | every date/time change |
| `_audit` | append-only change log |
| `_lookups` | learned dropdown suggestions |
| `_system` | **hidden**: `schema_version` and the calendar sync token. **No secrets** (the refresh token lives in the state file, §4.3). Never exposed through any API. |

### 6.2 `_categories`

`slug` (immutable), `name`, `color`, `sort`, `active`, `default_workspace`, `title_template`, `sheet_gid`, `is_seed`, `created_at`.
`title_template` uses `{field_key}` placeholders, e.g. `CCIE — {project_name} ({case_id})`.

### 6.3 `_fields` (the table that makes the system flexible)

`category_slug`, `key` (immutable), `label`, `type`, `required`, `options` (JSON array), `allow_new_options` (bool), `default_value`, `help_text`, `placeholder`, `unit`, `order`, `show_in_form`, `show_in_table`, `searchable`, `case_key` (bool), `computed_expr`, `locked` (core fields: cannot be deleted or have their type changed), `archived`, `created_at`.

**Config validation:** every config row is validated on load. An invalid row (bad JSON in `options`, unknown `type`, a formula that doesn't parse, a duplicate `key`) is skipped rather than crashing the app, and is listed under Admin → System health with a plain explanation. This matters because the father can edit these tabs directly in Sheets.

### 6.4 Field types

`text`, `long_text`, `number` (with optional `unit`), `date`, `time`, `select`, `multi_select`, `checkbox`, `url`, `file`, `auto_number`, `computed`.

When `select` has `allow_new_options = true`, the user may type a new value. It is saved to `options` (and `_lookups`), so the dropdown learns over time. This is used for State, PIU, RO, Contractor, ae_ie and similar fields.

### 6.5 Columns of every category tab

**Core fields** (present in **every** category and `locked`; they can be relabelled, hidden or reordered):

| key | Label | Type | Notes |
|---|---|---|---|
| `sr_no` | Sr. No. | auto_number | per category, max+1, never reused or renumbered |
| `date` | Date | date | **required; cannot be hidden** |
| `start_time` | Time | time | **required; cannot be hidden** |
| `end_time` | End time | time | optional; default = start + default duration (60 min) |
| `topic` | Topic | text | required unless the category has a `title_template` |
| `meeting_status` | Status | select (fixed: Scheduled, Rescheduled, Completed, Cancelled) | default Scheduled; **cannot be hidden** |
| `meeting_link` | Meeting Link | url | optional |
| `files` | File | file | optional, multiple |
| `remarks` | Remarks | text | |
| `details` | Details | long_text | also holds meeting notes (the done flow appends to it, §7.6); voice typing in P2 |
| `workspace` | Workspace | select | from `_workspaces`, default from the category; **cannot be hidden** |
| `reminder_minutes` | Reminders | text (comma-separated minutes) | blank = use the global default |

> **Important:** the CCIE and AT column lists given by the requester have no date or time. Every meeting still needs a date and time for the calendar and for dashboard ordering, so the core fields are added to **all** categories. The meeting-lifecycle column is called `meeting_status` / "Status" in the app UI, but must **not** collide with CCIE's own `status` field. Label it "Meeting status" wherever both appear.

**System columns** (never in forms; grouped at the far right of the tab and **hidden in the Sheets UI**):
`id` (ULID), `rev`, `created_at`, `updated_at`, `created_by`, `deleted_at`, `calendar_event_id`, `calendar_sync` (`ok|pending|error|none`), `previous_id` (links a meeting to the one before it in a series of sittings), `series_id` (P2 recurrence).

### 6.6 Computed fields and formula language

`computed` fields are **evaluated on read** (on the server, and on the client for previews) and are not stored. The Admin grid shows them with a "calculated" badge, and the Sheet header has a note saying "Calculated in the app". Never use `eval`/`Function`; implement a small, safe expression parser (Pratt parser) in `shared/`.

- Operators: `+ - * /`, comparisons, `and or not`.
- Functions: `today()`, `now()` (both in the configured timezone), `months_between(a, b)` (whole months, floor), `days_between(a, b)`, `coalesce(a, b, …)`, `if(cond, a, b)`, `concat(…)`, `upper(x)`, `lower(x)`, `round(n, d)`, `count_same(field_key)` = the number of non-deleted rows in this category tab whose `field_key` equals this row's value (including this row).
- References are by field key. An unknown key is a validation error when the admin saves the expression.
- **Performance:** cache `count_same` group counts once per cache version, not once per row.

### 6.7 Seed data

**Workspaces:** `NHAI`, `PhD`, `Personal` (each with a colour).

**Categories (in this order):** CCIE, SFC/PPPAC, MORTH, PMG, PATSC/IAC, File Discussion, AT (Award Target), Court Case, Others. Default workspace: NHAI.
**[Assumed / Open]** Also seed two PhD-workspace categories using the default format: **Supervisor Meeting** and **PhD Milestone / Deadline**. The father can archive them.

**CCIE: core fields plus, in this order** (all `show_in_form`, with sensible `show_in_table`):

| key | Label | Type | Notes |
|---|---|---|---|
| `action_to_be_taken_by` | Action to be taken by | text | suggest/autocomplete |
| `status` | Status | select, allow_new | options learned |
| `case_id` | Case Id | text | **required**, `case_key = true` |
| `status_of_dispute` | Status of Dispute | select, allow_new | |
| `status_of_detail_form` | Status of Detail Form | select, allow_new | |
| `allocated_ccie` | Allocated CCIE | select, allow_new | |
| `project_name` | Project Name | text | **required** |
| `upc` | UPC | text | |
| `piu` | PIU | select, allow_new | |
| `ro` | RO | select, allow_new | |
| `state` | State | select | seed all 28 states + 8 UTs of India |
| `contractor` | Contractor | select, allow_new | |
| `numbers_of_meeting` | Numbers of Meeting | computed | `count_same(case_id)` |
| `date_of_final_settlement_agreement` | Date of Final Settlement Agreement | date | |
| `date_of_initiation` | Date Of Initiation | date | |
| `pendency_months` | Pendency (In Months) | computed | `months_between(date_of_initiation, coalesce(date_of_final_settlement_agreement, today()))` |

`title_template`: `CCIE — {project_name} ({case_id})`.

**AT (Award Target): core fields plus:**

| key | Label | Type | Notes |
|---|---|---|---|
| `name_of_project` | Name of Project | text | **required** |
| `mode` | Mode | select, allow_new | **[Open]** suggested seeds: EPC, HAM, BOT |
| `length` | Length | number, unit `km` | |
| `civil_cost` | Civil Cost | number, unit **[Assumed] ₹ Cr** | |
| `total_cost` | Total Cost | number, unit **[Assumed] ₹ Cr** | |
| `bid_due_date` | Bid Due Date (BDD) | date | |
| `ae_ie` | AE/IE | select, allow_new | |

(AT's "Remarks" and "Sr. No." are the core `remarks` and `sr_no`.) `title_template`: `AT — {name_of_project}`.

**All other categories** (SFC/PPPAC, MORTH, PMG, PATSC/IAC, File Discussion, Court Case, Others, and the PhD ones) use **only the core fields**. These already match the requester's default format: Sr. No., Date, Time, Meeting (Types), Topic, Remarks, Meeting Link, File, Details. ("Meeting (Types)" is the category, shown automatically as a chip.)

**Others and "Add category":** `Others` is the catch-all default format. The category picker also has a **"+ Add new category"** tile (name + colour) that creates a new category and tab with the core fields. The admin can then add columns.

### 6.8 `Tasks` tab

`id`, `title`, `meeting_id` (optional), `category_slug`, `owner` (text), `due_date` (optional), `status` (`open|done`), `priority` (optional, `normal|high`), `workspace`, `created_at`, `completed_at`, `deleted_at`, `rev`. A task can be standalone or attached to a meeting.

### 6.9 Log tabs

- `_reschedules`: `id`, `meeting_id`, `category_slug`, `old_date`, `old_start`, `old_end`, `new_date`, `new_start`, `new_end`, `reason`, `source` (`app|admin|calendar|sheet|undo`), `changed_at`.
- `_audit`: `id`, `ts`, `user_email`, `action` (`create|update|delete|restore|complete|config|purge|backup|undo`), `table`, `row_id`, `changes` (JSON `{field: [old, new]}`), `source` (`app|admin|calendar|sheet|job|undo`). Append-only.
- `_files`: `id`, `meeting_id`, `category_slug`, `name`, `mime`, `size`, `drive_file_id`, `view_link`, `status` (`pending|attached|removed`), `uploaded_at`.
- `_lookups`: `field_key`, `category_slug`, `value`, `count`, `last_used`.

### 6.10 `_settings` keys

`timezone` (Asia/Kolkata), `default_duration_min` (60), `default_reminders` (`1440,60`), `calendar_id` (`primary`), `week_starts_on` (`monday`), `time_format` (`12h`), `digest_enabled` (false), `digest_time` (`08:00`), `digest_email`, `max_upload_mb`. Per-device UI preferences (text size, high contrast, chosen table columns) are stored in `localStorage` and mirrored in a cookie, so the first render on the server already uses the right text size.

---

## 7. Screens and flows

Every screen obeys Rule Zero (§3). Tags show the phase.

### 7.1 App shell (MVP)

- Left sidebar (or mobile drawer): **+ New meeting** (primary), then the built items from Dashboard, Tasks, Cases, Admin, Settings.
- Top bar: page title, **A / A+ / A++** text-size buttons, High contrast toggle, the user's name and **Sign out**.
- No footer. Content max width ~1200 px, centred on desktop.

### 7.2 Dashboard (MVP): the default landing page

Route `/`. A heading "Your meetings", then:

1. **"Next meeting" card** (top): the next upcoming meeting with a large date/time, title, category chip, and the buttons **Open** and **Join** (if there is a link). If there are none: "No upcoming meetings. [+ New meeting]".
2. **Attention line** (only shown when needed): one plain sentence per issue, each with a button. For example: "2 meetings aren't on your calendar yet. [Fix now]", or "1 meeting is missing required details. [Show]".
3. **Controls row:**
   - A big **search box** ("Search meetings…") that searches **every text field** of every category (case-insensitive substring, including category-specific fields and file names).
   - **Category** select, **Workspace** chips (All / NHAI / PhD / Personal), **Date range** select (Any, Today, This week, This month, Custom) and **Status** select.
   - A **More filters** button that opens a simple filter builder: add a filter → pick a column → pick an operator (by type: contains / is / is not / before / after / between / is empty / is not empty / greater / less) → enter a value. Active filters appear as removable chips, with a "Clear all" button.
   - Segmented buttons **[Upcoming | Past]** and **[Table | Calendar]**. The choice is remembered.
4. **Table view**
   - Rows are **grouped under date headings** ("Today", "Tomorrow", "Wed, 19 Nov 2026") and sorted **ascending by date and time** for Upcoming. **Past** is a separate tab, **most recent first**.
   - Default columns: Time, Category (chip), Meeting (title), Status (chip), Join (button), Files (count + button).
   - When one category is selected, that category's `show_in_table` columns also appear (e.g. Case Id, Project Name and Pendency for CCIE).
   - A **Choose columns** button (per device). Clicking a column header sorts by it, with a clear ▲/▼ and text such as "sorted by Date, oldest first". When sorted by anything other than date, the date headings are dropped.
   - Pagination: a "Show more" button (50 rows at a time). No infinite scroll.
   - Clicking a row opens the meeting detail. Mobile shows a **card list** instead of the table.
   - Rescheduled meetings show a "Rescheduled ×N" chip.
5. **Calendar view**
   - FullCalendar with labelled buttons **Month | Week | Day | List** and **Today / Previous / Next**. Events are coloured by category and prefixed with the category name. Clicking an event opens its detail.
   - Uses the same filters. The Upcoming/Past tabs are hidden here, because any date can be navigated to.
   - Mobile: a month grid with dots. Tapping a day lists that day's meetings below. Phones get List instead of the week/day grid.
   - **No drag-to-reschedule in MVP** (P3, with confirmation).

### 7.3 Meeting detail (MVP): `/meetings/[id]`

Sections, in this order:
1. Title, large date/time, status chip, category chip, workspace chip.
2. **Buttons (all visible, no menus):** **Reschedule** (primary for upcoming meetings), **Mark as done** (primary for meetings that have already started), Edit, Cancel meeting. Lower on the page: **Schedule next meeting**, Duplicate (P2), Delete.
3. **Join meeting** button (if there is a link).
4. **Details:** every visible field as label/value pairs, grouped into core and category-specific fields. Computed fields show their value with "calculated automatically".
5. **Files:** a list with **Open** and **Remove**, plus **Add file**.
6. **Action items** (P2): this meeting's tasks with big checkboxes, plus **Add action item**.
7. **Calendar status:** "On your Google Calendar ✓ [Open in Calendar]" or "Not on your calendar yet. [Add now]".
8. **Previous / next meeting** links (via `previous_id`), and a **Case timeline** link if the category has a `case_key` value (P2).
9. **Reschedule history:** old time → new time, the date of the change, and the reason.
10. **Change history** (collapsed by default, from `_audit`).

### 7.4 New / edit meeting form (MVP)

Routes `/meetings/new` and `/meetings/[id]/edit`. This is the big form.

- **Step 1: choose a category.** A grid of **big tiles** (one per active category, plus **"+ Add new category"**). Choosing a tile reloads the same page as `?category=slug`. A **"Change category"** link keeps the shared core fields.
- **Step 2: one long page**, with sections in this order:
  1. **When:** Date (with **Today** and **Tomorrow** quick buttons beside the picker), Start time, and either Duration quick buttons (**30 min · 1 hour · 2 hours · Other**) or an End time.
  2. **About this meeting:** Topic, then the category's fields in their configured order.
  3. **Link and files:** Meeting link, **Add files** button (multiple files, with progress; each file shows its name and a Remove button).
  4. **Notes:** Remarks, Details (auto-growing; mic button for voice typing in P2).
  5. **Reminders:** checkboxes (1 week before, 1 day before, 1 hour before, 15 minutes before), defaulted from settings.
  6. **Workspace:** chips.
- **Sticky bottom bar:** **Save meeting** (primary) and **Cancel**.
- Required fields are marked with the word **"(Required)"**, not just an asterisk. On submit, validation shows a summary at the top ("2 things need your attention", each one a link) and plain-language messages next to the fields, then scrolls to the first problem.
- Controls by field type: `text` → input; `long_text` → auto-growing textarea; `number` → numeric keypad (`inputmode="decimal"`) with the unit as a suffix; `date`/`time` → native pickers; `select` → large radio chips if it has ≤ 5 options, otherwise a combobox (with an **Add "xyz"** row if `allow_new_options` is on); `multi_select` → checkbox group; `checkbox` → large Yes/No toggle; `url` → input with a **Test link** button; `file` → upload button; `auto_number` and `computed` → read-only ("Calculated automatically").
- **Draft safety:** autosave to `localStorage`, keyed by meeting id. On reopening: "You have an unsaved draft. [Restore] [Discard]".
- **Clash warning (P2):** on save, if the time overlaps another meeting, show a yellow, non-blocking notice: "You already have *X* at 11:00 AM – 12:00 PM. [Save anyway] [Change time]".
- **After saving:** go to the meeting detail with the message "Meeting saved and added to your Google Calendar" (or the plain-language calendar-failure message).

### 7.5 Reschedule (MVP): `/meetings/[id]/reschedule`

A short full page (no dialog), opened from the detail page or a dashboard row.

- **Quick choices** (big buttons): **Same time tomorrow**, **Same time next week**, **Pick a new date and time**. A quick choice fills in the fields below; it doesn't save yet.
- Fields: **new date**, **new start time**, **end time or duration** (kept from the original by default) and an optional one-line **reason**.
- Buttons: **Save new time** (primary) and **Cancel**.
- Three taps from the dashboard: **Reschedule → Same time tomorrow → Save new time**.
- Effects: update the row, update the Calendar event, append to `_reschedules`, set the status to Rescheduled (§9), then return to the previous page with an **Undo** notice.

### 7.6 Mark as done & next meeting (MVP): `/meetings/[id]/done`

This page closes the core loop (§1.1). It has three parts, all on one page:

1. **"Notes from the meeting"** (optional textarea). The text is appended to `details` under a heading line `— Notes, Mon, 17 Nov 2026 —`.
2. **"Is there a next date?"** Big radio chips: **Yes** / **No** / **Not decided yet**.
   - **Yes** shows the date and time fields, with quick buttons (**Same time next week**, **Same time in 2 weeks**, **Pick a date**) and the original duration as default.
3. **Save** (primary) and **Cancel**.

Effects:
- The status changes to Completed.
- If **Yes**: a new meeting is created in the same category, copying every category-specific field and `topic`, `meeting_link`, `workspace` and `reminder_minutes`. Date, time, files, notes, remarks and status are **not** copied. The new meeting's `previous_id` is set to this one, and it is added to the calendar. The page then shows "Done. Next meeting on Mon, 1 Dec 2026 at 10:30 AM is on your calendar. [Open it] [Undo]".
- If **Not decided yet**: the meeting is marked done, and the attention line on the dashboard shows "1 case is waiting for a next date. [Show]" until the father either schedules the next meeting from the detail page or dismisses it. This applies only to categories with a `case_key`; other categories treat "Not decided yet" as No.
- **Schedule next meeting** on the detail page opens this same page, skipping step 1 if the meeting is already Completed.
- P2: once Tasks exist, the page also has an **"Action items"** section (add tasks in place).

### 7.7 Tasks (P2): `/tasks`

- A list of open tasks sorted by due date. Overdue tasks are shown **in red with the word "Overdue"**. A big checkbox marks a task done. A toggle shows completed tasks.
- **Add task** (title; due date, owner and meeting are optional). Tasks created from a meeting appear on that meeting.
- The dashboard shows a small "Tasks due today / overdue" card.
- **P3:** an option to show task due dates as all-day Google Calendar events.

### 7.8 Case timeline (P2): `/cases/[caseId]`

Available for any category with a field marked `case_key` (CCIE's Case Id by default; the admin can mark another field, e.g. after adding a Case Id to Court Case). One page per case value shows: summary fields, **all meetings with that case value across categories, in ascending order** (following `previous_id` links as well), open tasks, and all files. CCIE's **Numbers of Meeting** and **Pendency** come from `count_same` / `months_between`.

### 7.9 Admin (MVP, with P2 additions): `/admin`

Admin has a single sidebar item. Inside are **top tabs, one level only:** **Data tables · Columns & categories · Trash · Change log · Backups · System health**.

**a) Data tables: the raw database, Excel-style**
- A table selector listing **every table**: all category tabs, Tasks, `_categories`, `_fields`, `_workspaces`, `_settings`, `_files`, `_reschedules`, `_audit`, `_lookups`. **`_system` is never shown.**
- AG Grid shows all rows and all columns, including system columns, with column resize/reorder/pin, per-column filters, sort, quick search, a row count, and "freeze first columns".
- **Editable:** the category tabs and Tasks, with type-aware inline editors (date picker, select, checkbox…) and validation. A cell edit goes through the same service layer as the rest of the app, so rev checks, audit, calendar sync and reschedule logging all apply. Computed columns are read-only and show a "calculated" badge.
- **Read-only:** the config tabs (`_categories`, `_fields`, `_workspaces`, `_settings`) show the banner "Change these in Columns & categories or Settings" with a button. `_files`, `_reschedules`, `_audit` and `_lookups` are read-only. The raw grid can't corrupt the config.
- **Add row** and **Delete row** (soft delete, with confirmation). **Export CSV / Excel.** An **Open in Google Sheets** button links to the real spreadsheet.
- Dates and times are shown in friendly formats, with a **"Show raw values"** toggle.

**b) Columns & categories: the flexible-schema manager** (form-based, which is easier than grid header menus)
- Pick a category to see its columns. Each column has: label, type, **Required** toggle, **Show in form** toggle, **Show in table** toggle, **Hide (archive)**, **Move up / Move down** buttons and **Edit**. Core fields that can't be hidden (§6.5) show "Always shown" instead of the toggle.
- **Edit column:** label, type, options (add/remove/reorder, "Allow typing new values"), default value, help text, unit, `case_key`, and formula (for computed fields).
- An **Add column** button (the key is generated from the label and can't be changed later). Add or archive a category, and set its colour, default workspace and title template.
- Changes take effect immediately in forms, tables, filters and the Sheet header, **without a redeploy**.
- Type changes in the MVP are only allowed between compatible types (§9 rule 13); incompatible changes are blocked with a plain explanation. **P2:** a **live preview of the form**, and incompatible type changes that clear invalid cells after a typed confirmation and a backup.
- Permanent column or category removal needs a typed confirmation and **takes an automatic backup first** (§9 rules 12–13).

**c) Trash:** soft-deleted meetings, tasks and rows, with **Restore** and **Delete forever** (typed confirmation).

**d) Change log:** `_audit` and `_reschedules` in a searchable list.

**e) Backups** (manual in MVP, scheduled in P2): **Back up now** and a dated list of backups. **Use this backup** first backs up the current database, then switches `activeSpreadsheetId` in the state file to the chosen backup (re-tagging `appProperties.role` on both files) and reloads the cache. One button; nothing to do by hand.

**f) System health** (for the maintainer; plain words, each line with a button where an action exists):
- Google connection: "Connected as *x@gmail.com*" or "Needs sign-in [Sign in]"
- Last data refresh from the Sheet; **[Refresh now]**
- Meetings not on the calendar: count; **[Retry all]**
- Pending uploads, last backup, and each job's last run and result
- Config problems (§6.3), unmanaged columns (§11), duplicate databases found (§5.5)
- App version and `schema_version`

### 7.10 Other P2 features

- **Morning digest email:** at `digest_time` (default 8:00 AM IST), email the owner: today's meetings (time, title, link), a preview of tomorrow, cases waiting for a next date, and overdue and due-today tasks. Plain HTML, large font, no images. Settings has a single **"Turn on morning email"** switch, which triggers incremental consent for `gmail.send`.
  - **Interim (zero code, available from day one):** Google Calendar's own "Daily agenda" email notification lists the day's events. The README and the Settings page explain how to turn it on.
- **Printable weekly agenda:** `/print/week?start=YYYY-MM-DD` with a print stylesheet, and a **"Print this week"** button (the browser handles "Save as PDF").
- **Voice typing:** a mic button on `long_text` fields using the Web Speech API (language choice: English India `en-IN` / Hindi `hi-IN`). Hide the button where it isn't supported.
- **Import wizard:** upload `.xlsx`/`.csv` → choose a category → map columns → preview the first 10 rows → validation report → import. Rows without a valid date go into a downloadable error report and are skipped. **Don't create Calendar events for imported past meetings**; ask once about future ones.
- **Recurring meetings:** repeat daily/weekly/monthly until a chosen date. This creates **individual rows and individual calendar events** (not an RRULE) sharing a `series_id`, so each one can be rescheduled independently.
- **Duplicate:** copies a meeting's fields and asks only for the new date.
- **Saved views:** save the current search and filters under a name (e.g. "Court cases this month"). Saved views appear as buttons on the dashboard.
- **Share on WhatsApp:** a button that builds a prefilled `https://wa.me/?text=` message with the title, date, time and link.
- **"Not updated" nudge:** past meetings still marked Scheduled show a one-tap **Mark as done** in the attention line.
- **Sheets dropdowns:** mirror `select` options into Sheets data validation (dropdown, non-strict), so editing the raw Sheet is easier for the father.
- **Calendar orphans:** list calendar events whose `mmMeetingId` no longer matches a row (e.g. a row deleted by hand in the Sheet) in System health, with **[Remove from calendar]**.
- **Offline read-only:** see §7.12.

### 7.11 Settings (MVP)

Large, grouped and in plain language: **Text size**, **High contrast**, **Time zone**, **Default meeting length**, **Default reminders**, **Which calendar**, **Week starts on**, **12 / 24-hour time**, **Daily agenda email** (instructions for Google Calendar's built-in email; the app's own morning email arrives in P2), **Add to phone home screen** (instructions), **Sign out**.

### 7.12 PWA (basic in MVP, offline read in P2)

- MVP: a web app manifest and icons, installable on the phone home screen, with app-shell caching.
- P2: cache the last-fetched upcoming meetings. When offline, show them read-only with the banner "You're offline. Showing meetings saved at 3:10 PM." Writes are disabled while offline, with a plain explanation.

---

## 8. API (Express, JSON, same-origin, under `/api`)

All routes except `/auth/*` and `/health` require a valid session. Mutating routes require the `X-Requested-With: mm` header (CSRF protection on top of `SameSite=Lax`). All inputs are validated with Zod. Errors return `{ error: { code, message } }`, where `message` is plain language that can be shown to the user. **Every mutating response includes `undo_token` where an undo makes sense** (§9 rule 19).

| Method & path | Purpose |
|---|---|
| `GET /health` | health check (process up, state file readable, Google token status) |
| `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/me` | auth |
| `GET /meta` | categories, fields, workspaces, settings: everything the UI needs to render forms and tables |
| `GET /meetings` | query: `scope=upcoming\|past\|all`, `category`, `workspace`, `status`, `q`, `from`, `to`, `sort`, `dir`, `filters` (JSON), `limit`, `cursor` |
| `GET /meetings/:id` | one meeting (normalised: core + category fields + computed + files + tasks + previous/next + history) |
| `POST /meetings` | create (takes a client-generated `id`; idempotent, §4.6) |
| `PATCH /meetings/:id` | update (requires `rev`) |
| `POST /meetings/:id/reschedule` | `{date, start_time, end_time, reason?, rev}` |
| `POST /meetings/:id/complete` | `{notes?, next?: {date, start_time, end_time, id}, awaiting_next?: bool, rev}`; the done flow, §7.6 (`next.id` is client-generated, so this call is idempotent too) |
| `POST /meetings/:id/status` | `{status, rev}` (cancel / reopen / restore) |
| `DELETE /meetings/:id`, `POST /meetings/:id/restore` | soft delete / restore |
| `POST /meetings/:id/duplicate` | P2 |
| `GET /meetings/:id/history` | reschedule + audit history |
| `POST /undo/:token` | undo a recent change (§9 rule 19) |
| `POST /files` (multipart, `meeting_id`, `category`), `DELETE /files/:id` | upload / remove |
| `GET/POST/PATCH/DELETE /tasks` | P2 |
| `GET /cases/:caseId` | P2 |
| `GET /admin/tables`, `GET /admin/tables/:tab` (paged), `PATCH /admin/tables/:tab/rows/:id`, `POST …/rows`, `DELETE …/rows/:id` | raw tables (writes only for editable tabs, §7.9) |
| `GET/POST/PATCH /admin/categories`, `GET/POST/PATCH /admin/fields`, `POST /admin/fields/reorder` | schema management (archive by default; permanent removal needs a `confirm` token) |
| `GET /admin/trash`, `POST /admin/trash/:id/restore`, `DELETE /admin/trash/:id` | trash |
| `GET /admin/log` | audit + reschedules |
| `POST /admin/backup`, `GET /admin/backups`, `POST /admin/backups/:id/activate` | backups |
| `GET /admin/health` | system health (§7.9 f) |
| `GET /admin/export/:tab?format=csv\|xlsx` | export |
| `POST /calendar/retry/:meetingId`, `POST /calendar/retry-all`, `POST /calendar/pull` | calendar helpers (`pull` is P2) |
| `GET/PATCH /settings` | global settings |
| `POST /import/preview`, `POST /import/commit` | P2 |

---

## 9. Business rules

1. **Time.** A meeting starts at `date + start_time` in the configured timezone. Its end is `end_time`, or start + the default duration. The end must be after the start; meetings that cross midnight are not supported.
2. **Upcoming vs Past.** Upcoming = end time ≥ now. Past = end time < now.
3. **Status flow.** `Scheduled → Rescheduled` (automatic when the date, start or end changes) `→ Completed` (through the done flow, §7.6) or `Cancelled`. "Reopen" returns Completed to Scheduled. "Restore" returns Cancelled to Scheduled and restores the calendar event. Rescheduling a Completed meeting asks for confirmation.
4. **Reschedule logging.** **Any** change to `date`, `start_time` or `end_time`, from any path (reschedule page, edit form, admin grid, calendar pull, Sheet edit detected on refresh, undo), appends a row to `_reschedules`, bumps the "Rescheduled ×N" count and updates the calendar event. The reason is optional.
5. **Clash detection (P2).** An overlap of `[start, end)` with any non-deleted, non-cancelled meeting across all categories and workspaces gives a non-blocking warning. Back-to-back meetings are not clashes.
6. **Sr. No.** Per category tab: `max(sr_no) + 1` on create. Never reused or renumbered after deletes.
7. **Title.** Show `topic` if present; otherwise render the category's `title_template`, dropping missing parts cleanly. The same title is used in the Calendar event summary: `[<Category>] <title>`.
8. **Computed fields** are evaluated at read time (§6.6) and are read-only everywhere.
9. **Soft delete.** Set `deleted_at`, remove the calendar event, and keep the files. Restoring brings the event back. **Delete forever** is only available from Trash. It needs a typed confirmation, moves the meeting's Drive files to the Drive trash, and logs a `purge` audit entry. Nothing is purged automatically.
10. **Files.** Private in Drive; the link is `webViewLink`; `_files` is the source of truth; the `files` cell mirrors the links (§5.7).
11. **Calendar.** Sheet first, Calendar second; failures are retried and visible; event IDs are deterministic (§5.8).
12. **Archiving beats deleting.** A **column** or **category** is *archived*: hidden from forms, tables and pickers, with its data kept in the Sheet and still visible in Admin. A category that has rows cannot be hard-deleted. Permanent removal is an explicit admin action behind a typed confirmation and a forced backup.
13. **Type changes.** Allowed between compatible types (text ↔ long_text ↔ select, number → text). Before applying, show how many existing values would become invalid. Incompatible changes (e.g. text → date with unparseable values) are blocked in the MVP; in P2 they are allowed if the admin confirms that invalid cells will be cleared (backup first).
14. **Making a column Required.** Existing rows missing the value are **not** blocked. They get a small "Incomplete" chip, and the requirement is enforced the next time they are edited.
15. **Concurrency.** A `rev` check on every update (§4.6).
16. **Workspaces.** Every meeting and task belongs to exactly one workspace; the category provides the default. The dashboard filter chips use workspaces.
17. **Audit.** Every create, update, delete, restore, complete, purge, schema change, backup and undo writes to `_audit` (field-level old/new values).
18. **Learning dropdowns.** Values typed into `allow_new_options` selects are appended to `options` and counted in `_lookups`. The most-used values float to the top.
19. **Undo.** Undo is an **inverse operation through the same service layer**, not a delayed commit. The change is saved immediately (so closing the browser never loses it), and undo then applies the reverse: it restores the old values, moves the calendar event back, deletes a meeting created by the done flow, and logs everything with source `undo`. An `undo_token` is valid for 10 minutes and only while the row's `rev` is unchanged since the action. Otherwise: "This can't be undone because the meeting has changed since. [Open it]".
20. **Idempotency.** Creates take client-generated ids (§4.6), and calendar inserts use deterministic event ids (§5.8). Retrying any request never creates duplicates.
21. **Series.** `previous_id` links sittings of the same matter. A meeting has at most one next meeting; scheduling a second "next" from the same meeting asks "This meeting already has a next meeting on *date*. Replace it? [Open existing] [Create another anyway]".

---

## 10. Security & privacy

- **Allow-list login:** only `ALLOWED_EMAILS` may sign in, and the owner is `OWNER_EMAIL`. Anyone else sees the wrong-account message (§5.3). Non-owners are only asked for identity scopes.
- Tokens: the refresh token is encrypted at rest in the state file (AES-256-GCM), never sent to the browser and never logged. Access tokens are kept in memory only.
- Cookies are `httpOnly`, `Secure`, `SameSite=Lax`, with a CSRF header required on mutations. Use `helmet` security headers and a strict CSP. Next.js App Router needs a **per-request nonce** for its inline scripts; generate it in `middleware.ts` and pass it through. Don't fall back to `unsafe-inline` for scripts. Rate-limit `/api/auth/*` and upload routes.
- Uploads: MIME allow-list, size cap, sanitised file names, streamed (never buffered whole in memory). Drive files are private to the owner.
- Client-generated ids are validated as ULIDs; anything else is rejected.
- No `eval`/`Function` anywhere (the formula engine is a real parser). All user text is rendered as text (no `dangerouslySetInnerHTML`). Sheet formula injection is prevented by `RAW` writes and export neutralisation (§5.6).
- Secrets live only in environment variables and the encrypted state file. `.env.example` is committed; `.env` and `DATA_DIR` are git-ignored.
- The `_system` tab is excluded from every API response and from the Admin table list.
- **Data sensitivity note (for the README):** the data includes court cases and government project information. The requester should confirm that keeping it in a personal Google account is acceptable under the father's department policy. This is a personal-account tool that uses whichever Google account is chosen at sign-in. NHAI's official email may not be a Google account, so he should sign in with the Google account he uses for his phone calendar.

## 11. Errors and resilience

- Google errors: `429/5xx` → backoff with jitter and queueing; `401` → refresh the token and retry once; `403` insufficient scope → "Please sign in again to allow access" with a button; `404` spreadsheet missing → a full-page "Your database couldn't be found" with recovery steps (switch to a backup, or set up a new one).
- Server restart: the app keeps working without anyone signing in, because the token is read from the state file (§4.3). If the state file is gone, see §4.3.
- Network failure mid-save: keep the form data and show "We couldn't save. Your changes are still here. [Try again]". The retry is safe because creates are idempotent. Never silently drop input.
- Calendar and Drive problems never block saving to the Sheet. They appear as visible chips with a retry button (§5.8).
- The app tolerates manual edits to the Sheet: sorting, typed dates, hand-typed rows (adopted, §4.6), and columns added by hand (shown in Admin as "Unmanaged column" with an option to adopt them into the config). Invalid config rows are skipped and reported (§6.3).
- Every user-visible failure has a plain-language message. Technical details go to server logs (structured JSON, with no tokens or PII beyond ids).

## 12. Testing and quality gates

- **Unit (Vitest, run with `TZ=America/Los_Angeles`):** formula engine, date/time handling and timezone edge cases, row ↔ object mapping with padded/ragged rows, tolerant date parsing, Zod schema generation from config, config validation, title templates, calendar payload builder and event-id derivation, clash detection, status transitions, reschedule logging, undo inverses, encryption helpers, state-file atomic writes.
- **Integration (service layer against mock adapters):** CRUD, rev conflicts, idempotent create (same id twice → one row), calendar insert 409 → update path, soft delete/restore, done flow with and without a next meeting, undo of each action, archive column, type-change safeguards, bootstrap idempotency, migrations, database discovery with duplicates, restart with and without a state file, manual Sheet edits (sorted tab, hand-typed row, typed dates, column added by hand, broken `_fields` row), and every `MOCK_FAIL` mode.
- **E2E (Playwright, mock mode)** on **both a mobile viewport (390×844) and a desktop viewport (1440×900)**. Key flows: create a CCIE meeting; create an AT meeting; reschedule with "Same time tomorrow"; mark done with a next date; cancel + undo; upload a file; search/filter/sort; table ↔ calendar toggle; Upcoming ↔ Past; admin add column (it appears in the form, the table and the Sheet header); admin archive column; trash restore; A++ text doesn't break any layout; calendar failure shows the retry chip and still saves.
- **Accessibility gates:** `@axe-core/playwright` on every main screen with **zero serious/critical violations**; Lighthouse accessibility ≥ 95; keyboard-only navigation works everywhere; visible focus rings; a 48 px tap-target check on key buttons.
- **CI:** lint, typecheck (strict), unit, integration and e2e must all pass before merge.

## 13. Background jobs (`node-cron`, single instance)

| Job | Schedule | Phase |
|---|---|---|
| Retry failed calendar syncs (`calendar_sync = error/pending`) | every 5 min | MVP |
| Trash orphaned pending uploads older than 24 h | hourly | MVP |
| Refresh cache from Sheets (also adopts hand-typed rows and detects Sheet edits to dates) | on demand after 30 s TTL; every 5 min when idle | MVP |
| Daily backup: `files.copy` the spreadsheet to `Backups/backup-YYYY-MM-DD`, set `appProperties = {app, role: 'backup'}` on the copy, keep the last 30 | daily 02:00 IST | P2 |
| Morning digest email | at `digest_time` | P2 |
| Calendar two-way pull (`syncToken`) | every 10 min | P2 |

Every job records its last run and result in the state file (shown in System health). Jobs pause cleanly when the token is invalid and resume after the next sign-in. **[Verify]** whether `files.copy` carries over `appProperties`. Either way, set them explicitly on the copy so a backup is never mistaken for the database.

## 14. Configuration and deployment

**Environment variables** (commit `.env.example`):

```
NODE_ENV=production
PORT=3000
TZ=UTC
APP_URL=https://your-domain.example
GOOGLE_MODE=live                     # live | mock
MOCK_FAIL=                           # dev/test only: calendar,drive,sheets429,network
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
SESSION_SECRET=                      # 32+ random bytes
TOKEN_ENCRYPTION_KEY=                # 32 bytes, base64
DATA_DIR=/data                       # persistent volume for state.json
OWNER_EMAIL=
ALLOWED_EMAILS=                      # comma-separated, must include OWNER_EMAIL
SPREADSHEET_ID=                      # optional override; otherwise found via state file / Drive appProperties
DEFAULT_TIMEZONE=Asia/Kolkata
MAX_UPLOAD_MB=50
LOG_LEVEL=info
```

**Deployment checklist (README):** an always-on persistent Node host, a single instance, a persistent volume at `DATA_DIR`, an HTTPS domain, env vars set, the OAuth consent screen published, the redirect URI registered, `GET /api/health` monitored by an external uptime checker that alerts the requester, and a first sign-in by the owner (with the requester present), which runs bootstrap.

**`docs/MAINTAINER.md`** (written in M7, for the requester): how to add a category, add a column, switch to a backup, rotate `SESSION_SECRET` / `TOKEN_ENCRYPTION_KEY` (the owner simply signs in again), move to a new host (copy or lose `DATA_DIR`; both are safe), and read System health.

## 15. Milestones (build in this order)

**Each milestone ends with: tests green, accessibility checks green, the first-time-user test (§3) passed for any new UI, a `DECISIONS.md` note, and a tagged commit.**

**M0: Foundation (MVP)**
Repo, strict TS, lint, Vitest, Playwright. Express custom server hosting Next. Adapter interfaces + **mock mode with seeded demo data and failure injection**. i18n wiring (`next-intl`, `messages/en.json`). Design tokens and the UI kit sized for Rule Zero (Button, Input, Select, RadioChips, Combobox, Chip, Card, Dialog, Toast with Undo, FormField). App shell: left sidebar, mobile drawer, text-size buttons, high contrast.
*Done when:* the shell renders on mobile and desktop in mock mode; A++ text doesn't break layouts; axe is clean; no hard-coded user-facing strings.

**M1: Google spike, auth and bootstrap (MVP)**
Google OAuth (PKCE, offline, conditional `prompt`), allow-list, session cookie + middleware, encrypted owner token in the state file, bootstrap (spreadsheet, tabs, formatting, seeds, Drive folders), database discovery, migrations, `/api/meta`.
**Prove every [Verify] item with a real Google account:** Sheets read/write under `drive.file`; calendar insert with a custom id, a 409 on reuse, and restoring a deleted event through `update` + `status: confirmed`; whether `files.copy` keeps `appProperties`; popup reminders arriving on a phone; the server restarting without a new sign-in.
**Working slice:** a plain, unstyled form in live mode creates one meeting that lands as a Sheet row, as a Calendar event with reminders, and with an attached PDF in Drive.
*Done when:* the first sign-in on a clean Google account produces the spreadsheet with all tabs and seeded categories; a second sign-in reuses it; restarting the server needs no new sign-in; deleting the state file shows the re-login banner and recovers after the next sign-in; the working slice works end to end; the [Verify] results are recorded in `DECISIONS.md`.

**M2: Config engine and data layer (MVP)**
Category/field/workspace config services with validation, Zod generation from config, row mapping, cache, mutex, `rev`, tolerant reader, row adoption, idempotent create, soft delete, audit log, undo infrastructure, formula engine.
*Done when:* adding a field in config (via a test) changes validation, the Sheet header and the API output without code changes; concurrent edits return 409; posting the same create twice yields one row; a broken `_fields` row is skipped and reported.

**M3: Meeting create, edit, detail, reschedule, done (MVP)**
Category tiles, the dynamic long form, all field-type controls, validation, draft autosave, the detail page, the reschedule page with quick choices + `_reschedules`, the **mark as done & next meeting** page, status actions, undo notices, soft delete.
*Done when:* the CCIE and AT forms match §6.7 exactly; required rules work; rescheduling takes 3 taps and logs history; marking done with a next date creates the linked next meeting; every undo works; delete is undoable.

**M4: Dashboard (MVP)**
The next-meeting card, the attention line, Upcoming/Past tabs, the table view with date grouping, mobile cards, the calendar view, search across all fields, the filter builder, sort and the column chooser.
*Done when:* upcoming is strictly ascending by date and time; past is separate; searching for any value in any category field finds the meeting; the table and calendar show identical filtered sets.

**M5: Drive and Calendar, production-ready (MVP)**
Builds on the M1 slice: file upload (pending → attached, draft-restore checks), Drive folders, `_files`, link mirroring, calendar create/update/delete/restore with reminders, extended properties and deterministic ids, sync-status chips, retry job, orphan-upload job.
*Done when:* creating a meeting puts an event on the real Google Calendar with reminders within ~10 s; rescheduling moves it; cancelling removes it; restoring brings it back without a duplicate; a PDF uploaded in the form lands in Drive and its link appears in the Sheet and on the dashboard; a calendar failure still saves the meeting and shows the retry chip.

**M6: Admin (MVP)**
The raw tables grid (editable data tabs, read-only config/log tabs), add/soft-delete row, export, "Open in Google Sheets". The Columns & categories manager with archive, compatible type changes, forced backups and typed confirmations. Trash, change log, manual backup + "Use this backup", System health.
*Done when:* adding a column in Admin appears immediately in the form, the table and the Sheet header; archiving hides it but keeps the data; permanent removal needs a typed confirmation and creates a backup first; switching to a backup works with one button; System health reflects an injected calendar failure.

**M7: Hardening and release (MVP)**
Full Playwright suites on both viewports, axe + Lighthouse gates, the error states from §11, basic PWA, a README with Google Cloud and deploy steps (with screenshots), `docs/MAINTAINER.md`, `.env.example`.
*Done when:* the **MVP acceptance checklist** below passes.

**M8: Phase 2** (ordered by value to the father)
1. Tasks + the dashboard task card + action items in the done flow.
2. Meeting conveniences: "Not updated" nudge, Duplicate, clash warning.
3. Case timeline.
4. Daily automatic backups, morning digest email, printable weekly agenda.
5. Recurring meetings, saved views, WhatsApp share, voice typing.
6. Import wizard.
7. Calendar two-way sync; PWA offline read; calendar orphan cleanup.
8. Admin extras: live form preview, incompatible type changes with clearing, Sheets dropdown mirroring.

**M9: Phase 3**
Hindi UI (strings are already externalised), assistant/PA access with view-only or edit roles, attendee invites via Calendar, drag-to-reschedule with confirmation, tasks as calendar events, minutes templates.

### MVP acceptance checklist

- [ ] On a phone, a first-time user creates a CCIE meeting in under 90 seconds.
- [ ] The event appears on Google Calendar with reminders, and moving the meeting in the app moves the event.
- [ ] Rescheduling takes ≤ 3 taps, and the history shows the old and new times.
- [ ] Marking a meeting done with a next date takes under 30 seconds, and the next meeting is on the calendar.
- [ ] Upcoming is ascending and Past is a separate tab; table and calendar views both work on mobile and desktop.
- [ ] Search finds a value typed in any category-specific field; filters and sort work on any column.
- [ ] A PDF attached during entry is in Google Drive, and its link is in the Sheet and on the dashboard.
- [ ] Admin: raw tables for every tab; inline editing works on data tabs; adding, hiding and reordering columns, toggling Required and managing dropdown options need no redeploy.
- [ ] Deleting anything is undoable, Trash restores it, and a backup exists before any permanent removal.
- [ ] Text size A++ and High contrast work on every screen; axe reports zero serious violations.
- [ ] Killing the network mid-save loses no input, shows a plain-language message, and retrying never creates a duplicate meeting or calendar event.
- [ ] Restarting the server doesn't sign anyone out or stop the background jobs.
- [ ] A row typed by hand into the Sheet shows up in the app and on the calendar.

## 16. Open questions (build with the stated default; do not block)

1. **Dropdown option lists:** the real values for CCIE *Status*, *Status of Dispute*, *Status of Detail Form* and *Allocated CCIE*, and AT *Mode* (default: empty lists that learn, with suggested AT modes EPC, HAM, BOT).
2. **Units** for AT Length / Civil Cost / Total Cost (default: km and ₹ Cr).
3. **PhD categories:** keep the two seeded ones (Supervisor Meeting, PhD Milestone / Deadline), or use different ones?
4. **Court Case:** add an optional *Case Id* field so the case timeline and "waiting for a next date" work for court cases (default: not added; the admin can add it). *Recommended: add it. Court cases are the clearest example of the core loop.*
5. **Reminder defaults:** 1 day + 1 hour before (default), or something else?
6. **Hosting:** which provider and domain? It must be an always-on Node host with a persistent volume (not Vercel serverless, not a sleeping free tier).
7. **Google account:** confirm that the father uses a personal Google account with Calendar on his phone, and that departmental policy allows this data in that account.
8. **Language:** English only for the MVP; confirm Hindi for P3.
9. **Verify the glossary expansions** in §1.4 (used only for understanding; the app treats names as labels).
10. **Time format:** 12-hour (default) or 24-hour.
11. **Admin visibility:** should the father see Admin in his sidebar (default: yes, for both users), or only the requester?

---

## Appendix: changes from v1

- **Fixed:** the refresh token was stored only in the Sheet, so the server couldn't read it after a restart. It now lives in an encrypted local state file on a persistent volume (§4.3).
- **Fixed:** backup copies could be mistaken for the database. Files now carry an explicit `role` in `appProperties`, and the active id is stored locally (§5.5, §13).
- **Fixed:** duplicate meetings and events on retry. Creates are idempotent and calendar events use deterministic ids, with a [Verify]'d restore path (§4.6, §5.8).
- **Fixed:** Reschedule was a dialog form, which contradicted "forms are full pages". It is now a full page with quick choices (§7.5).
- **Fixed:** dashboard route inconsistency (`/` vs `/dashboard`); unbuilt sidebar items are now hidden.
- **Added:** the core loop and the **Mark as done & next meeting** flow in the MVP (§1.1, §7.6).
- **Added:** undo implemented as inverse operations (§9 rule 19); adoption of rows typed into the Sheet by hand; validation of config tabs; read-only config tabs in the raw grid.
- **Added:** Admin → System health, `docs/MAINTAINER.md`, a working agreement for the builder, [Verify] items and an M1 Google spike with a working slice.
- **Added:** conditional `prompt=consent`, identity-only scopes for non-owners, a CSP nonce note, a timezone leak test, mock failure injection, and Calendar reminder limits.
- **Moved to P2:** Admin live form preview and incompatible type changes. **Moved to MVP:** Schedule next meeting.