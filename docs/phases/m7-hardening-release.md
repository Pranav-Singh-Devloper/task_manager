# M7: Hardening and release (MVP)

**Spec refs:** §10, §11, §12, §14, MVP acceptance checklist, §15 M7

## Goal

Ship the MVP: full test suites, accessibility gates, error states, PWA basics and documentation.

## Scope

- Full Playwright suites on mobile (390x844) and desktop (1440x900) for every key flow in SPEC §12.
- axe on every main screen with zero serious or critical violations. Lighthouse accessibility at least 95. Keyboard-only run. 48 px tap-target check. A++ layout check.
- Every error state in SPEC §11 reachable through `MOCK_FAIL` and covered by a test.
- Security pass: CSP with per-request nonce, rate limits on auth and upload routes, CSRF header, headers via helmet.
- PWA: manifest, icons, app-shell caching.
- Docs: `README.md` (Google Cloud setup, deployment checklist, data sensitivity note), `docs/MAINTAINER.md`, `.env.example`.
- CI workflow: lint, typecheck, unit, integration, e2e.

## Tasks

- [x] E2E suites for all flows listed in SPEC §12
- [x] Accessibility sweep and fixes
- [x] Error pages and messages (database not found, sign-in again, offline-save failure)
- [x] CSP nonce middleware, rate limiting
- [x] Manifest, icons, service worker for app shell
- [x] `README.md`, `docs/MAINTAINER.md`, `.env.example`
- [x] GitHub Actions CI

## Definition of done

The MVP acceptance checklist in SPEC §15 is recorded in `DECISIONS.md`. Items that need a real Google account or a real phone are listed there and in `docs/MAINTAINER.md` for the maintainer to run. Tag `m7-done` and `v1.0.0`.
