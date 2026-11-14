# M0: Foundation (MVP)

**Spec refs:** §3 Rule Zero, §4.1 to §4.5, §7.1, §15 M0

## Goal

A running app skeleton in mock mode: Express hosting Next.js, adapter interfaces with seeded mock implementations, i18n wired, a UI kit sized for Rule Zero, and the app shell (sidebar, mobile drawer, text-size and contrast controls).

## Scope

- Repo scaffolding: strict TypeScript, ESLint, Prettier, Vitest, Playwright.
- Express custom server serving Next.js (`next({ dev })`, `server.all('*', handle)`), `GET /api/health`.
- Adapter interfaces: `SheetsRepo`, `DriveClient`, `CalendarClient`, `MailClient`, `StateStore`. Mock implementations with seeded demo data for every category, fake login, fake Drive and Calendar.
- Failure injection via `MOCK_FAIL=calendar,drive,sheets429,network`.
- `next-intl` with `messages/en.json`.
- Design tokens: 18 px base font, Noto Sans, one accent (`#1E40AF`), 10-colour category palette, status palette, 48 px tap targets, high-contrast theme.
- UI kit: Button, Input, Select, RadioChips, Combobox, Chip, Card, Dialog, Toast (with Undo), FormField.
- App shell: left sidebar (240 px, at least 768 px wide), mobile drawer behind a labelled "Menu" button, "+ New meeting" button, A / A+ / A++ text size, High contrast toggle, sign out placeholder.

## Tasks

- [ ] `package.json`, `tsconfig` (strict), ESLint, Prettier, scripts (`dev`, `build`, `start`, `test`, `test:e2e`, `lint`, `typecheck`)
- [ ] Express + Next custom server, health route, pino logging, helmet
- [ ] `.env.example`, config loader with validation
- [ ] Adapter interfaces in `server/services/google/`
- [ ] Mock adapters and demo seed data (all 9 categories plus 2 PhD categories)
- [ ] Failure injection and unit tests for it
- [ ] `next-intl` setup, `messages/en.json`, lint rule or test against hard-coded strings
- [ ] Tailwind config with tokens, Noto Sans, text-size and contrast via CSS variables and cookie
- [ ] UI kit components with unit or axe checks
- [ ] App shell and placeholder Dashboard, Admin and Settings pages
- [ ] Playwright config for 390x844 and 1440x900, axe on the shell
- [ ] `DECISIONS.md` created with the first entries

## Definition of done

- The shell renders on mobile and desktop in mock mode.
- A++ (150%) text does not break the layout.
- axe reports no serious or critical violations.
- No hard-coded user-facing strings.
- `typecheck`, `lint` and `test` pass. Tag `m0-done`.

## Out of scope

Google auth, real data, meeting forms, dashboard content.
