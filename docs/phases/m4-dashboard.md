# M4: Dashboard (MVP)

**Spec refs:** §7.2, §9 rule 2, §15 M4

## Goal

One place to find every meeting: next meeting card, attention line, table and calendar views, search, filters and sort.

## Scope

- "Next meeting" card and the attention line (shown only when needed).
- Controls: search over every text field, Category, Workspace chips, Date range, Status, filter builder with removable chips and Clear all.
- Upcoming / Past tabs and Table / Calendar toggle, remembered per device.
- Table grouped under date headings (Today, Tomorrow, full date), ascending for Upcoming, most recent first for Past. Default and per-category columns, Choose columns, header sort with a text description, "Show more" pagination (50 rows).
- Mobile card list. "Rescheduled xN" chip.
- FullCalendar with Month, Week, Day, List and Today / Previous / Next, category colours, mobile month grid with day list. No drag to reschedule.

## Tasks

- [x] `GET /meetings` query handling: scope, category, workspace, status, q, from, to, sort, dir, filters, limit, cursor (in memory)
- [x] Filter builder with operators by field type
- [x] Dashboard page, next-meeting card, attention line
- [x] Table view with TanStack Table, grouping, sorting, column chooser
- [x] Mobile card list
- [x] Calendar view with FullCalendar sharing the same filters
- [x] Debounced search (250 ms)
- [x] Playwright flows on both viewports; first-time-user check

## Definition of done

- [x] Upcoming is strictly ascending by date and time. Past is a separate tab.
- [x] Searching for any value in any category field finds the meeting.
- [x] Table and calendar show identical filtered sets.
- Tag `m4-done`.
