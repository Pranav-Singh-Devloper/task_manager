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

## Open items that need a real Google account

All `[Verify]` items in SPEC §5 and M1 are still open: Sheets under `drive.file` only, custom event id and 409 on reuse, restoring a deleted event with `update` + `status: "confirmed"`, whether `files.copy` keeps `appProperties`, popup reminders on a phone, restart without sign-in. The mock follows the behaviour the spec expects, so these must be confirmed against real Google before M1 is called done.
