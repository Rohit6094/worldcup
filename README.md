# World Cup 2026 Predict & Win

A responsive, points-based prediction game for FIFA World Cup 2026 knockout matches. Users can view fixtures, predict winners and scores, and browse leaderboard rankings.

This project intentionally does not implement betting, gambling, payments, odds, wallets, deposits, wagering, or cash prizes. It is only a prediction game for leaderboard points.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Python serverless functions for Vercel
- JSON mock data and local JSON fallback for Python development
- football-data.org via protected Python endpoints
- Optional Vercel KV / Upstash REST storage for users, predictions, and cache
- Optional Google Sheets append-only prediction log
- Optional API-Football / API-Sports fallback support

## Folder Structure

```text
world-cup-2026-predict-win/
|-- api/
|   |-- auth.py
|   |-- match_details.py
|   |-- matches.py
|   |-- leaderboard.py
|   |-- predictions.py
|   `-- submit_prediction.py
|-- data/
|   |-- mock_matches.json
|   |-- mock_leaderboard.json
|   |-- predictions.json
|   `-- users.json
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

Leaderboard data is calculated from shared registered users and stored predictions. Registered users with no predictions can still appear with 0 points.

Signup, login, admin user management, and prediction submissions use Python API endpoints. If Vercel KV REST variables are configured, users and predictions are stored in KV and shared across devices. Without KV, `python local_server.py` stores users and predictions in local JSON files for development only.

## Caching and Storage

Match data is cached with a default TTL of 900 seconds. This keeps football-data.org usage low and is suitable for a few hundred users because many page loads reuse the same cached response.

Configure Vercel KV or Upstash REST for shared users, predictions, and faster cache storage:

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
- `/api/matches?refresh=1` bypasses the app match cache and fetches fresh provider data immediately.
- If Vercel KV is configured, match data is also cached across serverless invocations.
- If a provider request fails, the API can serve the last known good KV match snapshot.
- `/api/auth` stores and reads shared users from Vercel KV when configured.
- `/api/submit_prediction` stores predictions in Vercel KV when configured.
- `/api/predictions` reads stored Vercel KV predictions for the admin page.
- Without KV, the local Python server stores users and predictions in `data/users.json` and `data/predictions.json`.
- Google Sheets receives an append-only copy of predictions when configured.

Force a live match refresh:

```text
Local:  http://127.0.0.1:8000/api/matches?refresh=1
Vercel: https://your-domain.vercel.app/api/matches?refresh=1
```

## Demo Accounts

Login, signup, prediction ownership, and admin access are demo API features. Passwords are salted and hashed server-side, but this is still not production authentication.

To create a demo admin user, enter this invite code during signup:

```text
WC26-ADMIN-DEMO
```

Production accounts need server-side sessions, durable user storage, role checks, rate limiting, password reset, and email verification.

Admin page:

```text
/admin.html
```

The admin page supports CRUD for shared demo users and prediction CRUD that syncs to Vercel KV when configured. This is an admin UI demo, not production authorization.

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
