# M8: Phase 2

**Spec refs:** §5.8 (two-way sync), §5.9, §7.7, §7.8, §7.10, §7.12, §13, §15 M8

Do not start until M7 is tagged. Order is by value to the father.

## Work items, in order

1. **Tasks:** `/tasks`, dashboard "due today / overdue" card, action items on the meeting detail and in the done flow.
2. **Meeting conveniences:** "Not updated" nudge, Duplicate, clash warning on save.
3. **Case timeline:** `/cases/[caseId]` across categories, following `previous_id`.
4. **Backups and digest:** daily backup job (keep 30), morning digest email via Gmail with incremental consent, printable weekly agenda.
5. **Recurring meetings, saved views, WhatsApp share, voice typing.**
6. **Import wizard:** `.xlsx` and `.csv`, column mapping, preview, validation report.
7. **Calendar two-way sync** (`syncToken`, every 10 minutes), PWA offline read-only, calendar orphan cleanup.
8. **Admin extras:** live form preview, incompatible type changes with clearing, Sheets dropdown mirroring.

## Definition of done

Each item ships on its own with tests, an accessibility check and a tagged commit (`m8-1-done` and so on). The sidebar gains Tasks and Cases only when those pages exist.
