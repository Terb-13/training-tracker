# LOTOJA 2026 — Team Training OS

Next.js 16 App Router + Supabase solo dashboard: morning KPIs, **live Garmin sync** (Node `garmin-connect`), cycling base, strength splits, nutrition bridge, rhythm score, SQL **fat-loss engine**, and a **Grok-ready** JSON export.

> **Note on libraries:** The popular PyPI package `garminconnect` **0.3.x** is Python-only. This app uses the **Node** package [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) (same Garmin Connect APIs: activities, weight, sleep, HR). If you prefer Python workers, call the same `/api/sync` contract from a sidecar.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon (public) key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used by `/api/sync` when called with `Authorization: Bearer …` (GitHub Actions) — never expose to the browser or commit
- `GARMIN_ENCRYPTION_KEY` — **required for Garmin settings**; at least 16 characters; used server-side to encrypt Garmin password + OAuth tokens in `profiles` (AES-256-GCM via scrypt-derived key)

## Database (RLS)

Run these in order in the Supabase SQL editor (or `supabase db push`):

1. `supabase/migrations/001_initial.sql` — `profiles` + RLS
2. `supabase/migrations/002_v02_garmin_engine.sql` — Garmin columns, `activities`, `body_composition`, `strength_sessions`, `daily_deficit`, RLS, and `calculate_projected_loss(user_id)` for weekly lb/wk pace

Each user only sees their own rows.

## Garmin login & first sync

1. **Apply migrations** above so new tables and RPC exist.
2. **Set `GARMIN_ENCRYPTION_KEY`** in `.env.local` (and Vercel Production env).
3. Sign in to the app, open **Dashboard → Garmin settings** (`/dashboard/settings`).
4. Enter the **same email and password** you use for Garmin Connect (or Garmin SSO). Save once; password is encrypted at rest.
5. On the dashboard, click **Sync Garmin now**. The server logs in via `garmin-connect`, stores OAuth tokens, pulls the **last 7 days** of activities, daily weights, and derives strength sessions (Chest/Triceps, etc.), cycling volume, Zone 2 estimate, watts/kg when power exists, daily deficit vs `target_calories`, and updates `garmin_wellness` (sleep / HR–based recovery).
6. If sync fails (MFA, captcha, or expired session), update the password in settings (clears tokens) and sync again.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up or use magic link; the first dashboard load creates your profile row (height 170 cm, age 33, target 3000 kcal, start weight 204.2 lb, Wednesday lunch relax).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Set environment variables: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, **`GARMIN_ENCRYPTION_KEY`**.
4. Supabase Auth redirect URLs must include `https://your-app.vercel.app/auth/callback`.

## Daily sync (GitHub Actions)

Workflow: `.github/workflows/daily-sync.yml` — `curl` POST to `https://YOUR_APP/api/sync` with:

- Header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- JSON body: `{ "userId": "<your auth.users id>" }`

**Repository secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_USER_ID` (UUID from Supabase → Authentication → Users), `APP_URL` (e.g. `https://your-app.vercel.app`).

Adjust the `cron` schedule to run after your morning block (default `14:00 UTC`). Use **workflow_dispatch** for manual tests.

## Backups

`.github/workflows/backup.yml` is a stub for `pg_dump` into a private repo such as `training_db-backups`. Use `SUPABASE_DB_URL` and a deploy token — never log secrets.

## Scripts

| Command   | Description        |
| --------- | ------------------ |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

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
- Garmin credentials are encrypted with `GARMIN_ENCRYPTION_KEY`; rotate key only with a migration path to re-encrypt (or re-enter password in settings).
