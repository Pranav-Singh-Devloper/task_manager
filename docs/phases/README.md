# Build phases

The build follows the milestone order in [SPEC.md §15](../../SPEC.md). Each milestone has its own file here with scope, task checklist, definition of done and the commit plan.

| Phase | Milestone | Ships | Doc |
|---|---|---|---|
| MVP | M0 | Foundation: server, mock mode, i18n, UI kit, app shell | [m0-foundation.md](m0-foundation.md) |
| MVP | M1 | Google spike, auth, bootstrap, working slice | [m1-google-auth-bootstrap.md](m1-google-auth-bootstrap.md) |
| MVP | M2 | Config engine and data layer | [m2-config-data-layer.md](m2-config-data-layer.md) |
| MVP | M3 | Meeting create, edit, detail, reschedule, done | [m3-meeting-flows.md](m3-meeting-flows.md) |
| MVP | M4 | Dashboard | [m4-dashboard.md](m4-dashboard.md) |
| MVP | M5 | Drive and Calendar, production-ready | [m5-drive-calendar.md](m5-drive-calendar.md) |
| MVP | M6 | Admin | [m6-admin.md](m6-admin.md) |
| MVP | M7 | Hardening and release | [m7-hardening-release.md](m7-hardening-release.md) |
| Phase 2 | M8 | Tasks, conveniences, backups, digest, import, two-way sync | [m8-phase-2.md](m8-phase-2.md) |
| Phase 3 | M9 | Hindi UI, assistant access, drag-to-reschedule | [m9-phase-3.md](m9-phase-3.md) |

## Rules that apply to every phase

1. **Rule Zero** (SPEC §3) overrides everything. If a feature makes the UI more complex for the primary user, simplify or cut it.
2. Build a working slice before adding breadth. Do not build later-phase features early, and never show unbuilt features in the UI.
3. Every user-facing string goes through `next-intl` (`messages/en.json`). No hard-coded text in components.
4. Each phase ends with: tests green, accessibility checks green, the first-time-user test (SPEC §3) for any new UI, a `DECISIONS.md` entry, and a tag (`m0-done`, `m1-done`, ...).
5. Commits are small and one concern each, using conventional prefixes (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
6. New dependencies need a one-line reason in `DECISIONS.md`.

## Build environment note

Real Google credentials are not available during development. M0 to M7 are built and tested against the mock adapters (`GOOGLE_MODE=mock`). The live-mode code paths are written against the same interfaces. The `[Verify]` items in M1 and the "real Google account" checks in M1 and M5 need a human with the Google account, and are tracked as open items in `DECISIONS.md` until they are run.
