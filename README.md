# LOTOJA 2026 — Team Training OS

Next.js 16 App Router + Supabase solo dashboard: morning KPIs, **Strava OAuth** (official REST API), cycling base, manual strength logging, nutrition bridge, rhythm score, SQL **fat-loss engine**, and a **Grok-ready** JSON export.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Strava API application](https://www.strava.com/settings/api) (Client ID + Client Secret)

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon (public) key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used by `/api/sync` when called with `Authorization: Bearer …` (GitHub Actions) — never expose to the browser or commit
- `INTEGRATION_ENCRYPTION_KEY` — **required**; at least 16 characters; encrypts Strava OAuth tokens in `profiles` (AES-256-GCM)
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` — from Strava API settings
- `SYNC_USER_ID` (optional) — your `auth.users` UUID for scheduled CI sync

In the Strava developer app, set **Authorization Callback Domain** to your deployment host (e.g. `localhost` for dev, `your-app.vercel.app` for production) and add the exact redirect URL: `https://YOUR_HOST/api/strava/callback` (and `http://localhost:3000/api/strava/callback` locally).

## Database (RLS)

Run migrations in order in the Supabase SQL editor (or `supabase db push`):

1. `001_initial.sql` — `profiles` + RLS  
2. `002_v02_garmin_engine.sql` — training tables (historical filename; creates `activities`, `body_composition`, etc.)  
3. Later migrations `003`–`008` as needed  
4. **`009_strava_pivot.sql`** — drops Garmin profile columns, adds Strava + `recovery_wellness`, renames `garmin_activity_id` → `external_activity_id`

Each user only sees their own rows.

## Strava connect & sync

1. Apply migrations (including `009_strava_pivot.sql` on existing projects).
2. Set `INTEGRATION_ENCRYPTION_KEY`, `STRAVA_CLIENT_ID`, and `STRAVA_CLIENT_SECRET` in `.env.local` and Vercel.
3. Sign in, open **Dashboard → Settings** (`/dashboard/settings`), click **Connect Strava**, approve `activity:read_all`.
4. On the dashboard, click **Sync Strava now**. The server refreshes tokens if needed, pulls the **last ~14 days** of cycling activities (Ride, VirtualRide, e-bike, MTB, gravel), maps power/TSS proxy/calories/distance/duration into `activities`, rolls up **active calories** into `daily_deficit` with BMR estimate, and sets `strava_last_sync_at`.
5. **Recovery signals** (sleep, HRV, RHR, recovery score) are **manual** — edit them on Settings; they power the Daily Rhythm tab.
6. **Weight** — log manually on Settings for the fat-loss charts.
7. **Strength** — use **Log a strength session** on the Strength tab (Chest & Triceps, Back & Biceps, Shoulders & Core) with sets/reps/weights; data is stored with a negative `external_activity_id` so it never collides with Strava ride IDs.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up or use magic link; the first dashboard load creates your profile row (height 170 cm, age 33, target 3000 kcal, start weight 204.2 lb, Wednesday lunch relax).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Set environment variables: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_ENCRYPTION_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
4. Supabase Auth redirect URLs must include `https://your-app.vercel.app/auth/callback`.
5. Strava callback URL must match exactly: `https://your-app.vercel.app/api/strava/callback`.

## Daily sync (GitHub Actions)

Workflow: `.github/workflows/daily-sync.yml` — `curl` POST to `https://YOUR_APP/api/sync` with:

- Header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- JSON body: `{ "userId": "<your auth.users id>" }`

**Repository secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_USER_ID`, `APP_URL` (e.g. `https://your-app.vercel.app`).

Adjust the `cron` schedule to run after your morning ride. Use **workflow_dispatch** for manual tests.

## Backups

`.github/workflows/backup.yml` is a stub for `pg_dump` into a private repo such as `training_db-backups`. Use `SUPABASE_DB_URL` and a deploy token — never log secrets.

## Scripts

| Command         | Description        |
| --------------- | ------------------ |
| `npm run dev`   | Development server |
| `npm run build` | Production build   |
| `npm run start` | Production server  |
| `npm run lint`  | ESLint             |

## Repository layout

This app is its **own Git repository** (clone/push from this folder only). It is not tied to a parent monorepo in version control.

```bash
cd /path/to/trainer
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Create an **empty** GitHub (or GitLab) repository first, then add `origin` and push. Vercel should import **this** repo root, not a parent folder.

## Security

- Do not commit `.env.local` or secrets (`.gitignore` ignores `.env*` except `.env.example`).
- Service role key only on the server (CI, `/api/sync` bearer auth).
- Strava tokens are encrypted with `INTEGRATION_ENCRYPTION_KEY`; disconnect clears them in `profiles`.
