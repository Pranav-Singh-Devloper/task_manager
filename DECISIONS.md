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

## Open items that need a real Google account

All `[Verify]` items in SPEC §5 and M1 are still open: Sheets under `drive.file` only, custom event id and 409 on reuse, restoring a deleted event with `update` + `status: "confirmed"`, whether `files.copy` keeps `appProperties`, popup reminders on a phone, restart without sign-in. The mock follows the behaviour the spec expects, so these must be confirmed against real Google before M1 is called done.
