# Meetings & Tasks Manager

A simple web app for keeping meetings, reminders, documents and next dates in one place. Data lives in a Google Sheet in the owner's own Google account, files go to their Google Drive, and meetings appear on their Google Calendar with reminders on the phone. See [SPEC.md](SPEC.md) for the full product and technical spec and [docs/phases](docs/phases/README.md) for how it was built.

**Who it is for:** one busy person who attends many meetings and wants to plan, get reminded, attend, and record the next date without learning software. Everything is built around large text, clear words and few buttons.

## Run it on your computer (no Google account needed)

```bash
npm install
npm run dev          # http://localhost:3000, runs on built-in demo data (GOOGLE_MODE=mock)
```

| Command | What it does |
|---|---|
| `npm test` | Unit and integration tests (about 480) |
| `npm run test:e2e` | Browser tests on a phone-sized and a desktop-sized screen, with accessibility checks |
| `npm run lint` / `npm run typecheck` | Style and strict type checks |
| `npm run build` / `npm start` | Production build and run |

To rehearse failures, start with for example `MOCK_FAIL=calendar npm run dev`. Copy `.env.example` to `.env` to change settings. In mock mode, `/api/auth/google?as=someone@example.com` signs in as that address, which is how the "wrong account" and "not set up yet" messages are tried out.

## Connect it to real Google

1. **Create a project** at [console.cloud.google.com](https://console.cloud.google.com/projectcreate). Enable the **Google Sheets API, Google Drive API, Google Calendar API and Gmail API** (Gmail is for the Phase 2 morning email).
2. **Google Auth Platform, Branding / Audience:** app name, support email and contact email. Audience is **External**. Add the owner's Google account as a **test user**.
3. **Data access:** add the scopes `openid`, `userinfo.email`, `userinfo.profile`, `drive.file` and `calendar.events`. Nothing broader is needed.
4. **Clients:** create a **Web application** client. Redirect URI: `http://localhost:3000/api/auth/google/callback`, and later the production address.
5. Put the client ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), set `GOOGLE_MODE=live`, and generate the two secrets: `openssl rand -hex 32` for `SESSION_SECRET` and `openssl rand -base64 32` for `TOKEN_ENCRYPTION_KEY`. Set `OWNER_EMAIL` and `ALLOWED_EMAILS`.
6. **Do the first sign-in together with the owner.** Google shows an "unverified app" screen the first time (Advanced, then Continue), and it looks alarming. The owner must leave both the Calendar and Drive boxes ticked.
7. **Before real use, publish the app** (Audience page, Publish app). While it is in Testing, Google signs the owner out every 7 days. Publishing needs a home page link and a privacy policy link, so it comes after deployment.

The first sign-in creates the spreadsheet "Meetings Manager — Database" and a "Meetings Manager" folder in the owner's Drive. If the saved sign-in is ever lost, signing in again finds the same spreadsheet. Nothing is lost, because all data lives in Google.

## Deploying it

The app is **one Node process** (Express with Next.js inside) that must stay running. It keeps the owner's encrypted sign-in in a small file, runs two background jobs (retry the calendar every 5 minutes, clear unsaved uploads hourly), and holds undo links and a short-lived cache in memory. So it needs **an always-on host with a persistent disk**, not a serverless platform where each request may run on a different, short-lived machine.

Checklist:

- [ ] A host that runs a long-lived Node 20+ process: for example Render, Railway or Fly.io (with a persistent disk), or a small server of your own. **Exactly one instance.**
- [ ] A persistent volume mounted at `DATA_DIR` (it holds `state.json`). If it is ever lost, the owner signs in once more and the same spreadsheet is found again.
- [ ] An HTTPS address, set as `APP_URL`, and the same address plus `/api/auth/google/callback` registered as the redirect URI in Google.
- [ ] All variables from [.env.example](.env.example) set, with `GOOGLE_MODE=live`. Never commit `.env`.
- [ ] Build with `npm ci && npm run build`, start with `npm start`. Or use the included [Dockerfile](Dockerfile): `docker build -t meetings-manager .`, then run it with the variables above and a volume on `/data`.
- [ ] On Render, [render.yaml](render.yaml) describes the service (one instance, a 1 GB disk at `/data`, the health check). Create it with New, Blueprint, and fill in the values marked as secret. Railway and Fly.io work the same way from the Dockerfile.
- [ ] An outside uptime checker (for example UptimeRobot) watching `GET /api/health`, set to alert the maintainer.
- [ ] The Google app **published** (see step 7 above), using the deployed home page and a privacy policy link.
- [ ] The first sign-in done by the owner with the maintainer present. That creates the database.

### Free hosting on a Google Cloud VM

Google Cloud's always-free tier includes one `e2-micro` VM (in us-west1, us-central1 or us-east1) with a 30 GB standard disk. It is always on and keeps its disk, so it suits this app. Steps:

1. In the Compute Engine page, create a VM: machine type `e2-micro`, region one of the three above, boot disk Debian 12 with 30 GB **standard** persistent disk, and tick **Allow HTTP traffic** and **Allow HTTPS traffic**. Reserve its external IP (VPC network, IP addresses) so it never changes.
2. Click **SSH** on the VM and run the one-line command at the top of [deploy/gcp/setup.sh](deploy/gcp/setup.sh). It adds swap, installs Docker, builds the app, and gets a free HTTPS address of the form `1-2-3-4.sslip.io` with an automatic certificate.
3. Add the address it prints to the OAuth client's authorised redirect URIs, and to the consent screen's home page link.

## Data sensitivity

The data can include court cases and government project information. Whoever uses this should confirm that keeping it in a personal Google account is acceptable under their department's policy. This is a personal-account tool that uses whichever Google account is chosen at sign-in. NHAI's official email may not be a Google account, so the owner should sign in with the Google account he uses for his phone calendar.

## Security in short

Only the emails in `ALLOWED_EMAILS` can sign in. The Google refresh token is encrypted on disk (AES-256-GCM) and never reaches the browser or the logs. Cookies are `httpOnly` and `SameSite=Lax`, every change needs a CSRF header, scripts run only with a per-request nonce, sign-in and upload routes are rate limited, uploads are type-checked, size-capped and streamed, and text that looks like a spreadsheet formula is always stored and exported as text.

## For the maintainer

See [docs/MAINTAINER.md](docs/MAINTAINER.md): adding a category or column, switching to a backup, changing secrets, moving host, and reading System health. Design decisions and open items are in [DECISIONS.md](DECISIONS.md).
