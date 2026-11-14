# M3: Meeting create, edit, detail, reschedule, done (MVP)

**Spec refs:** §7.3 to §7.6, §9 rules 1 to 4, 7, 9, 19, 21, §15 M3

## Goal

The core loop: Plan, then get reminded, then attend, then record the outcome and the next date.

## Scope

- Category tile picker with "+ Add new category".
- Dynamic long form built from field config. Controls per field type (§7.4). Required marked with the word "(Required)". Error summary with links. Draft autosave to `localStorage` with Restore / Discard.
- Meeting detail page, sections in the order given in §7.3, all actions as visible labelled buttons.
- Reschedule page: quick choices (Same time tomorrow, Same time next week, Pick a new date and time), reason, three taps from the dashboard.
- Mark as done page: notes, next date (Yes / No / Not decided yet), creates the linked next meeting with `previous_id`.
- Status actions (Cancel, Reopen, Restore), soft delete, undo notices (at least 10 seconds, `role="status"`).

## Tasks

- [x] Form field controls: text, long_text, number with unit, date, time, select (radio chips or combobox), multi_select, checkbox, url with Test link, read-only computed and auto_number (file upload is M5)
- [x] `/meetings/new` and `/meetings/[id]/edit`
- [x] `/meetings/[id]` detail with history sections
- [x] `/meetings/[id]/reschedule`
- [x] `/meetings/[id]/done`, plus "Schedule next meeting" from detail
- [x] Complete route (`POST /meetings/:id/complete`), reschedule route, status route, delete and restore routes
- [x] Undo wiring for every mutating action
- [x] "Not decided yet" tracking for categories with a `case_key`
- [x] Series rule: second "next" from the same meeting prompts
- [x] Playwright flows on both viewports; first-time-user check

## Definition of done

- [x] CCIE and AT forms match SPEC §6.7 exactly.
- [x] Required rules work.
- [x] Rescheduling takes 3 taps and logs history.
- [x] Marking done with a next date creates the linked next meeting.
- [x] Every undo works. Delete is undoable.
- [x] Automated first-time-user run under 90 seconds. The test with a person who has never seen the app is still to do.
- Tag `m3-done`.

Also built in this phase: learning dropdowns (moved here from M2) and the add-a-category page.
