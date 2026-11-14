# Meetings & Tasks Manager

A simple web app for keeping meetings, reminders, documents and next dates in one place. Data lives in a Google Sheet in the owner's own Google account. See [SPEC.md](SPEC.md) for the full product and technical spec and [docs/phases](docs/phases/README.md) for the build plan.

## Run it on your computer (no Google account needed)

```bash
npm install
npm run dev          # http://localhost:3000, runs on built-in demo data (GOOGLE_MODE=mock)
```

Other scripts: `npm test` (unit and integration), `npm run test:e2e` (browser tests on a phone and a desktop screen), `npm run lint`, `npm run typecheck`, `npm run build`, `npm start`.

To rehearse failures, start with for example `MOCK_FAIL=calendar npm run dev`.

Copy `.env.example` to `.env` to change settings. Live Google setup and deployment steps are added with the release phase.

## Status

Built phase by phase. See the table in [docs/phases/README.md](docs/phases/README.md).
