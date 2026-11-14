# Meetings & Tasks Manager

A simple web app for keeping meetings, reminders, documents and next dates in one place. Data lives in a Google Sheet in the owner's own Google account. See [SPEC.md](SPEC.md) for the full product and technical spec and [docs/phases](docs/phases/README.md) for the build plan.

## Run it on your computer (no Google account needed)

```bash
npm install
npm run dev          # http://localhost:3000, runs on built-in demo data (GOOGLE_MODE=mock)
```

Other scripts: `npm test` (unit and integration), `npm run test:e2e` (browser tests on a phone and a desktop screen), `npm run lint`, `npm run typecheck`, `npm run build`, `npm start`.

To rehearse failures, start with for example `MOCK_FAIL=calendar npm run dev`.

Copy `.env.example` to `.env` to change settings. In mock mode, `/api/auth/google?as=someone@example.com` signs in as that address, which is how the "wrong account" and "not set up yet" messages are tried out.

## Connect it to real Google

1. **Create a project** at [console.cloud.google.com](https://console.cloud.google.com/projectcreate). Enable the **Google Sheets API, Google Drive API, Google Calendar API and Gmail API** (Gmail is for the Phase 2 morning email).
2. **Google Auth Platform, Branding / Audience:** app name, support email and contact email. Audience is **External**. Add the owner's Google account as a **test user**.
3. **Data access:** add the scopes `openid`, `userinfo.email`, `userinfo.profile`, `drive.file` and `calendar.events`. Nothing broader is needed.
4. **Clients:** create a **Web application** client. Redirect URI: `http://localhost:3000/api/auth/google/callback`, and later the production address.
5. Put the client ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), set `GOOGLE_MODE=live`, and generate the two secrets: `openssl rand -hex 32` for `SESSION_SECRET` and `openssl rand -base64 32` for `TOKEN_ENCRYPTION_KEY`. Set `OWNER_EMAIL` and `ALLOWED_EMAILS`.
6. **Do the first sign-in together with the owner.** Google shows an "unverified app" screen the first time (Advanced, then Continue), and it looks alarming. The owner must leave both the Calendar and Drive boxes ticked.
7. **Before real use, publish the app** (Audience page, Publish app). While it is in Testing, Google signs the owner out every 7 days. Publishing needs a home page link and a privacy policy link, so it comes after deployment.

The first sign-in creates the spreadsheet "Meetings Manager — Database" and a "Meetings Manager" folder in the owner's Drive. If the saved sign-in is ever lost, signing in again finds the same spreadsheet. Nothing is lost, because all data lives in Google.

## Status

Built phase by phase. See the table in [docs/phases/README.md](docs/phases/README.md).
