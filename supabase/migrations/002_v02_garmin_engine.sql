-- v0.2 — Garmin columns, training tables, RLS, fat-loss function

alter table public.profiles
  add column if not exists garmin_email text,
  add column if not exists garmin_password_encrypted text,
  add column if not exists garmin_tokens_encrypted text,
  add column if not exists garmin_last_sync_at timestamptz,
  add column if not exists max_hr integer,
  add column if not exists garmin_wellness jsonb;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  garmin_activity_id bigint not null,
  activity_type text,
  activity_name text,
  start_time_gmt timestamptz not null,
  duration_sec integer,
  distance_m numeric,
  calories integer,
  avg_hr integer,
  max_power integer,
  avg_power integer,
  elevation_gain_m numeric,
  sport_type_key text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, garmin_activity_id)
);

create table if not exists public.body_composition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight_lbs numeric not null,
  body_fat_pct numeric,
  muscle_mass_lbs numeric,
  source text not null default 'garmin',
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.strength_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  garmin_activity_id bigint not null,
  label text not null,
  started_at timestamptz not null,
  duration_sec integer not null,
  volume_kg numeric,
  exercise_summary jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, garmin_activity_id)
);

create table if not exists public.daily_deficit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  active_calories integer not null default 0,
  resting_calories_est integer not null default 0,
  calories_in integer,
  deficit_kcal integer,
  projected_weekly_loss_lbs numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists activities_user_start_idx on public.activities (user_id, start_time_gmt desc);
create index if not exists body_comp_user_date_idx on public.body_composition (user_id, date desc);

alter table public.activities enable row level security;
alter table public.body_composition enable row level security;
alter table public.strength_sessions enable row level security;
alter table public.daily_deficit enable row level security;

drop policy if exists "activities_own" on public.activities;
create policy "activities_own" on public.activities for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "body_comp_own" on public.body_composition;
create policy "body_comp_own" on public.body_composition for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "strength_own" on public.strength_sessions;
create policy "strength_own" on public.strength_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "deficit_own" on public.daily_deficit;
create policy "deficit_own" on public.daily_deficit for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_daily_deficit_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_deficit_updated on public.daily_deficit;
create trigger daily_deficit_updated
before update on public.daily_deficit
for each row execute function public.set_daily_deficit_updated_at();

-- Rolling window: oldest vs newest weight in last ~8 days → lb/wk pace (positive = losing)
create or replace function public.calculate_projected_loss(p_user_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  w_start numeric;
  w_end numeric;
  d_start date;
  d_end date;
  days int;
begin
  select weight_lbs, date into w_start, d_start
  from public.body_composition
  where user_id = p_user_id
    and date >= current_date - interval '8 days'
  order by date asc
  limit 1;

  select weight_lbs, date into w_end, d_end
  from public.body_composition
  where user_id = p_user_id
    and date >= current_date - interval '8 days'
  order by date desc
  limit 1;

  if w_start is null or w_end is null or d_start is null or d_end is null then
    return null;
  end if;
  if d_start >= d_end then
    return null;
  end if;

  days := d_end - d_start;
  return ((w_start - w_end) / days::numeric) * 7;
end;
$$;
