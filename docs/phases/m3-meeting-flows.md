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

- [ ] Form field controls: text, long_text, number with unit, date, time, select (radio chips or combobox), multi_select, checkbox, url with Test link, file placeholder, read-only computed and auto_number
- [ ] `/meetings/new` and `/meetings/[id]/edit`
- [ ] `/meetings/[id]` detail with history sections
- [ ] `/meetings/[id]/reschedule`
- [ ] `/meetings/[id]/done`, plus "Schedule next meeting" from detail
- [ ] Complete route (`POST /meetings/:id/complete`), reschedule route, status route, delete and restore routes
- [ ] Undo wiring for every mutating action
- [ ] "Not decided yet" tracking for categories with a `case_key`
- [ ] Series rule: second "next" from the same meeting prompts
- [ ] Playwright flows on both viewports; first-time-user check

## Definition of done

- CCIE and AT forms match SPEC §6.7 exactly.
- Required rules work.
- Rescheduling takes 3 taps and logs history.
- Marking done with a next date creates the linked next meeting.
- Every undo works. Delete is undoable.
- Tag `m3-done`.
