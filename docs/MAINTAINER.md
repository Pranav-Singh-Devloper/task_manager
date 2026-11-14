# Maintainer guide

For whoever keeps this running for the owner. Everything below is done in the app unless it says otherwise. No code change or redeploy is needed for day-to-day changes.

## Add a category (a new kind of meeting)

1. Open the dashboard, choose **+ New meeting**, then **+ Add new category**. Give it a name and a colour.
2. In **Admin → Columns & categories**, choose the category to set its default workspace and a title for meetings that have no topic (for example `Site visit — {location}`).
3. Add its own columns (next section).

A category can be hidden (its meetings and data are kept) from the same screen. A category with no meetings can be removed for good; that asks you to type its name and makes a backup first.

## Add, change or hide a column

**Admin → Columns & categories**, choose the category, then **+ Add column**.

- Pick the kind of answer. For "choose one" or "choose many", write one choice per line, and tick *Allow typing new choices* if people should be able to add their own.
- **Show in table** puts it on the dashboard when that category is chosen. **Must be filled in** makes it required (old meetings that lack it get a small "Incomplete" note and are not blocked).
- **Hide** keeps all the data and takes the column out of forms and tables. **Show** brings it back.
- Changing the kind of answer is only allowed when every existing answer still fits. The screen says what would happen before you save.
- **Remove column for good** deletes the column and everything typed in it. You must type its name, and a backup is made first.

The new column is added to the Google Sheet's header row automatically.

## Switch to a backup

**Admin → Backups**. **Back up now** makes a full copy in Google Drive (the app also does this before anything is removed for good). **Use this backup** first backs up what is there now, then makes the chosen copy the live data. Nothing else is needed.

If the live spreadsheet is ever deleted, the app shows a page offering **Use my newest backup** or **Set up a new database**.

## Change the secrets

- `SESSION_SECRET`: change it and restart. Everyone is signed out and signs in again.
- `TOKEN_ENCRYPTION_KEY`: change it and restart. The saved Google sign-in can no longer be read, so the owner signs in once more. Nothing is lost; the same spreadsheet is found again.
- Google client secret: create a new one in Google Cloud, update `GOOGLE_CLIENT_SECRET`, restart.

## Move to a new host

Copy the `DATA_DIR` folder to the new host, or leave it behind. Both are safe: without `state.json` the owner signs in once and the app finds the existing spreadsheet in Google Drive. Set the same environment variables, update `APP_URL` and the redirect URI in Google, and keep to **one running instance**.

## Reading System health

**Admin → System health** lists, in plain words:

- **Google connection**: connected, or needs sign-in (use the Sign in button).
- **Last read from the Sheet**: the app reads the Sheet at most every 30 seconds. **Refresh now** forces it.
- **Meetings on the calendar**: how many missed Google Calendar. **Retry all** tries again. The background job also retries every 5 minutes.
- **Unsaved uploads**, **last backup**, and each background job's last run.
- **Problems found**: spreadsheet settings the app skipped (for example a hand-edited row it could not read), columns it does not manage, and cells it could not understand.
- **Databases found in Drive** (more than one means a copy was tagged as the database), and the **version**.

## Editing the Sheet by hand

The owner or you can open the Google Sheet and edit it. Sorting, typed dates, and rows typed by hand are all tolerated: a hand-typed row with a readable date becomes a meeting (and goes onto the calendar). A date changed in the Sheet is noticed on the next refresh and recorded as a reschedule. Do not delete the hidden `_system` tab or rename the header cells of the config tabs.

## Things only a person with the real Google account can check

These were built against the same interfaces the mock uses, and need one real run:

- Create a meeting two days ahead and confirm the phone notifies at the reminder times.
- Upload a PDF in the form, then check it is in Drive under `Meetings Manager / <Category> / <Year>` and the link opens.
- Cancel and restore a meeting and confirm there is never a second calendar event.
- Publish the Google app (needs the deployed home page and a privacy policy link).
- Run Lighthouse's accessibility audit on the main screens (the automated axe checks already report zero serious problems).
- Have someone who has never seen the app add a meeting on a phone (the target is under 90 seconds).
