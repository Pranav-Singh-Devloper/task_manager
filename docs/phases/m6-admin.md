# M6: Admin (MVP)

**Spec refs:** §7.9, §9 rules 12 to 14, §11, §15 M6

## Goal

Let the maintainer (and the father) see raw tables like Excel and change the schema with no developer and no redeploy.

## Scope

- Admin area with one level of top tabs: Data tables, Columns & categories, Trash, Change log, Backups, System health.
- Desktop-first, with the notice "Admin works best on a computer. [Continue anyway]" on small screens.
- Data tables: AG Grid, every table except `_system`, editable data tabs through the service layer, read-only config and log tabs, add row, soft-delete row, CSV and Excel export (formula-prefix neutralisation), Open in Google Sheets, Show raw values toggle.
- Columns & categories: add, edit, reorder, hide (archive), Required, Show in form and table, options management, `case_key`, formula field, category add and archive, colour, default workspace, title template. Compatible type changes only, with counts of values that would become invalid.
- Permanent removal behind a typed confirmation and a forced backup.
- Trash with Restore and Delete forever. Change log search. Manual backup and "Use this backup". System health.

## Tasks

- [x] Admin routes (`/admin/tables`, `/admin/categories`, `/admin/fields`, `/admin/trash`, `/admin/log`, `/admin/backups`, `/admin/health`, `/admin/export`)
- [x] Sheet header sync on column add, rename and archive
- [x] AG Grid page with type-aware editors and computed badges
- [x] Columns & categories manager pages
- [x] Backup service (`files.copy`, explicit `appProperties`) and activation
- [x] Trash, change log and health pages
- [x] Playwright flows: admin add column shows in form, table and Sheet header; archive; trash restore; backup switch; injected calendar failure shows in health

## Definition of done

- [x] A column added in Admin appears immediately in the form, the table and the Sheet header.
- [x] Archiving hides it but keeps the data.
- [x] Permanent removal needs a typed confirmation and creates a backup first.
- [x] Switching to a backup works with one button.
- [x] System health reflects an injected calendar failure.
- Tag `m6-done`.
