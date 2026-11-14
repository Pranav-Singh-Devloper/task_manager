# M2: Config engine and data layer (MVP)

**Spec refs:** §4.6, §6, §9 rules 6 to 8, 15 to 21, §11, §15 M2

## Goal

The service layer that makes the schema flexible. Adding a field through config changes validation, the Sheet header and the API output with no code change.

## Scope

- Config services for categories, fields and workspaces, with per-row validation (bad rows skipped and reported).
- Zod schemas generated from field config at runtime.
- Row mapping (tolerant of padded and ragged rows), tolerant date and time parser.
- In-memory cache (single `batchGet`, 30 s TTL, forced refresh), write-through, per-tab mutex and write queue, backoff with jitter.
- `rev` optimistic concurrency (409), row re-index check before update.
- Idempotent create (client ULID), adoption of hand-typed rows, soft delete.
- Audit log, undo infrastructure (inverse operations, 10 minute tokens, rev check), reschedule logging helper.
- Formula engine in `shared/` (Pratt parser, no `eval`): `today`, `now`, `months_between`, `days_between`, `coalesce`, `if`, `concat`, `upper`, `lower`, `round`, `count_same`.
- Title templates, Sr. No. allocation, time helpers (configured timezone, never server local time).

## Tasks

- [x] `shared/` types, field-type definitions, formula tokenizer, parser, evaluator
- [x] `server/lib/` cache, mutex, backoff, dates
- [x] `services/config.ts` and `services/schema.ts`
- [x] Meetings service: list, get, create, update, delete, restore, status
- [x] `services/audit.ts` and `services/undo.ts`
- [x] `services/reschedule.ts` logging on any date or time change
- [x] Row adoption and tolerant reader
- [x] Routes: `meetings`, `undo`, `settings`, `meta`
- [x] Unit tests (run with `TZ=America/Los_Angeles`) and integration tests against mocks

## Definition of done

- [x] Adding a field in config (via a test) changes validation, the Sheet header and API output without code changes.
- [x] Concurrent edits return 409.
- [x] Posting the same create twice yields one row.
- [x] A broken `_fields` row is skipped and reported.
- [x] Checked read-only against the real spreadsheet: a full load is 2 Sheets calls, with no config problems.
- Tag `m2-done`.

Moved: learning dropdowns go to M3 with the form (see `DECISIONS.md`).
