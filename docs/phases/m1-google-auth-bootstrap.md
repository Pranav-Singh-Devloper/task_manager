# M1: Google spike, auth and bootstrap (MVP)

**Spec refs:** §4.3, §5.1 to §5.8, §10, §15 M1

## Goal

Prove the riskiest part first: one meeting going App, then Sheet, then Calendar, then Drive, in live mode. Auth, session, encrypted owner token and first-run bootstrap come with it.

## Scope

- Google OAuth 2.0 server-side code flow with PKCE, `access_type=offline`, conditional `prompt` (`consent` only when the owner has no stored refresh token or a scope is missing, otherwise `select_account`).
- Allow-list (`ALLOWED_EMAILS`), owner (`OWNER_EMAIL`), wrong-account and "not set up yet" messages.
- Session: HS256 JWT (`jose`) in an `httpOnly`, `Secure`, `SameSite=Lax` cookie, 30-day sliding expiry. Next.js `middleware.ts` redirects to `/login`. One big "Sign in with Google" button.
- `DATA_DIR/state.json`: AES-256-GCM encrypted refresh token, ids, job status. Atomic writes (temp file, fsync, rename). Missing-file recovery banner.
- Live adapters for Sheets, Drive and Calendar behind the M0 interfaces.
- `bootstrap.ts` (idempotent): find database (`SPREADSHEET_ID`, then Drive `appProperties` search), create spreadsheet and all tabs, seed config, formatting, Drive folders, `schema_version` migrations.
- `GET /api/meta`.
- Working slice: a plain unstyled form that creates one meeting (Sheet row, Calendar event with reminders, PDF in Drive).

## `[Verify]` items (record each result in `DECISIONS.md`)

- [x] Sheets read and write work on the app-created spreadsheet with the `drive.file` scope alone.
- [x] `events.insert` with a custom id works. A reused id returns 409.
- [x] A deleted event can be restored through `events.update` with `status: "confirmed"`.
- [x] Whether `files.copy` keeps `appProperties`.
- [ ] Popup reminders arrive on a phone. (Needs the owner's phone: the event holds the reminders, see `DECISIONS.md`.)
- [x] The server restarts without needing a new sign-in.

These were run against a real Google account. Results, including that `files.copy` does not keep `appProperties`, are in `DECISIONS.md`.

## Tasks

- [x] `server/lib/crypto.ts` (AES-256-GCM) with tests
- [x] `server/services/state.ts` atomic state file with tests
- [x] `server/services/google/auth.ts` (PKCE, state/CSRF, token refresh, `invalid_grant` handling)
- [x] Auth routes and session cookie, middleware, login page
- [x] Live `sheets.ts`, `drive.ts`, `calendar.ts` adapters
- [x] Deterministic calendar event id derivation with tests (34 chars, base32hex)
- [x] `bootstrap.ts` with discovery, creation, seeding, migrations; runs against mock in tests
- [x] `/api/meta`
- [x] Spike form and route for the working slice
- [x] README section for Google Cloud setup (screenshots are added in M7)

## Definition of done

- [x] First sign-in on a clean account produces the spreadsheet with all tabs and seeded categories; a second sign-in reuses it.
- [x] Restarting the server needs no new sign-in.
- [x] Deleting the state file shows the re-login banner and recovers after the next sign-in.
- [x] The working slice works end to end (mock mode in CI, and checked live against real Google).
- [x] `[Verify]` results recorded. One item (phone reminders) needs the owner's phone. Tag `m1-done`.
