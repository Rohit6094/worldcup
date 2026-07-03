# World Cup 2026 Predict & Win

A responsive, points-based prediction game for FIFA World Cup 2026 knockout matches. Users can view fixtures, predict winners and scores, and browse leaderboard rankings.

This project intentionally does not implement betting, gambling, payments, odds, wallets, deposits, wagering, or cash prizes. It is only a prediction game for leaderboard points.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Python serverless functions for Vercel
- JSON mock data and browser localStorage for demo prediction data
- football-data.org via protected Python endpoints
- Optional Vercel KV / Upstash REST storage and cache
- Optional Google Sheets append-only prediction log
- Optional API-Football / API-Sports fallback support

## Folder Structure

```text
world-cup-2026-predict-win/
|-- api/
|   |-- matches.py
|   |-- leaderboard.py
|   `-- submit_prediction.py
|-- data/
|   |-- mock_matches.json
|   |-- mock_leaderboard.json
|   `-- predictions.json
|-- public/
|   |-- index.html
|   |-- leaderboard.html
|   |-- matches.html
|   |-- css/
|   |   `-- styles.css
|   |-- js/
|   |   |-- main.js
|   |   |-- leaderboard.js
|   |   |-- matches.js
|   |   `-- api.js
|   `-- assets/
|       `-- README.md
|-- local_server.py
|-- docs/
|   `-- google-sheets-apps-script.js
|-- vercel.json
|-- requirements.txt
|-- .env.example
|-- .gitignore
`-- README.md
```

## Run Locally With Python

Create a `.env` file in the project root:

```text
FOOTBALL_DATA_KEY=your_football_data_org_key_here
MATCH_CACHE_TTL_SECONDS=900
```

Then run:

```bash
python local_server.py
```

Open:

```text
http://127.0.0.1:8000
```

Test the matches API directly:

```text
http://127.0.0.1:8000/api/matches
```

Do not use `python -m http.server -d public` if you need live API data. That command only serves static files and cannot run `/api/matches`.

The local server reads `.env`, calls football-data.org with the `X-Auth-Token` header, and keeps the token server-side.

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import the project in Vercel.
3. Keep the framework preset as Other.
4. Add `FOOTBALL_DATA_KEY` in Project Settings -> Environment Variables.
5. Redeploy.

## API Key

The football-data.org API key must be stored in an environment variable named:

```text
FOOTBALL_DATA_KEY
```

`api/matches.py` uses:

- Base URL: `https://api.football-data.org/v4`
- Competition: `WC`
- Season: `2026`
- Header: `X-Auth-Token`

The frontend never reads or exposes this key.

## Mock Fallback Data

If `FOOTBALL_DATA_KEY` is missing, the API request fails, or no fixtures are returned, `/api/matches` falls back to `data/mock_matches.json` and returns a `fallbackReason`.

`data/mock_matches.json` and `public/data/mock_matches.json` are refreshed snapshots from football-data.org. The browser uses `public/data/mock_matches.json` as a static fallback if `/api/matches` is unavailable.

Leaderboard data is calculated from stored predictions. If no predictions exist yet, the leaderboard returns an empty state instead of fake mock users.

Prediction submissions are validated by `/api/submit_prediction`. If Vercel KV REST variables are configured, predictions are stored server-side. Without KV, the API returns a successful server echo and the browser stores predictions in `localStorage` for local demo use.

## Caching and Storage

Match data is cached with a default TTL of 900 seconds. This keeps football-data.org usage low and is suitable for a few hundred users because many page loads reuse the same cached response.

Configure Vercel KV or Upstash REST for faster shared prediction storage:

```text
KV_REST_API_URL=your_kv_rest_url
KV_REST_API_TOKEN=your_kv_rest_token
```

Optional Google Sheets logging can be added with a Google Apps Script web app:

```text
GOOGLE_SHEETS_WEBHOOK_URL=your_apps_script_web_app_url
GOOGLE_SHEETS_WEBHOOK_SECRET=your_shared_secret
```

Use Google Sheets as an append-only audit/export log, not as the primary high-traffic read database. Vercel KV is the better fit for fast reads and leaderboard aggregation.

The Apps Script template is in `docs/google-sheets-apps-script.js`. Paste it into a Google Sheet's Apps Script editor, replace `SHARED_SECRET`, deploy it as a web app, and use that web app URL as `GOOGLE_SHEETS_WEBHOOK_URL`.

Runtime behavior:

- `/api/matches` caches football-data.org results for `MATCH_CACHE_TTL_SECONDS`.
- If Vercel KV is configured, match data is also cached across serverless invocations.
- If a provider request fails, the API can serve the last known good KV match snapshot.
- `/api/submit_prediction` stores predictions in Vercel KV when configured.
- `/api/predictions` reads stored Vercel KV predictions for the admin page.
- Google Sheets receives an append-only copy of predictions when configured.

## Demo Accounts

Login, signup, prediction ownership, and admin access are browser-local demo features. Passwords are salted and hashed before local storage, but this is not production authentication.

To create a demo admin user, enter this invite code during signup:

```text
WC26-ADMIN-DEMO
```

Production accounts need server-side sessions, durable user storage, role checks, rate limiting, password reset, and email verification.

Admin page:

```text
/admin.html
```

The admin page supports browser-local CRUD for demo users and prediction CRUD that syncs to Vercel KV when configured. This is an admin UI demo, not production authorization.

Read-only points page:

```text
/points.html
```

It shows two sections:

- User Specific Predictions
- Overall Predictions

## Scoring

- Correct winner: 2 points
- Exact score: 3 points
- Participation points: 0
- Bonus points: 0

## Production Notes

Vercel serverless functions should not be used for persistent file writes. A production version should save users, predictions, and scoring records in a real database such as Supabase, Neon, Firebase, or Vercel KV.

Future improvements:

- Add real authentication
- Add a persistent database
- Add an admin panel
- Lock predictions after kickoff
- Add email verification
- Add advanced scoring rules
