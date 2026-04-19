-- Pivot from Garmin to Strava; external_activity_id for Strava or manual negative IDs
-- Safe if re-applied: only rename / drop when old names still exist.

alter table public.profiles
  drop column if exists garmin_email,
  drop column if exists garmin_password_encrypted,
  drop column if exists garmin_tokens_encrypted,
  drop column if exists garmin_last_sync_at,
  drop column if exists garmin_wellness,
  drop column if exists max_hr;

alter table public.profiles
  add column if not exists strava_tokens_encrypted text,
  add column if not exists strava_last_sync_at timestamptz,
  add column if not exists recovery_wellness jsonb;

comment on column public.profiles.strava_tokens_encrypted is 'AES-GCM blob: Strava OAuth access/refresh tokens';
comment on column public.profiles.recovery_wellness is 'Optional manual sleep/HRV/RHR/recovery JSON for dashboard';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'garmin_activity_id'
  ) then
    alter table public.activities rename column garmin_activity_id to external_activity_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strength_sessions' and column_name = 'garmin_activity_id'
  ) then
    alter table public.strength_sessions rename column garmin_activity_id to external_activity_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strength_exercises' and column_name = 'garmin_activity_id'
  ) then
    alter table public.strength_exercises rename column garmin_activity_id to external_activity_id;
  end if;
end $$;

comment on column public.activities.external_activity_id is 'Strava activity id (positive) or negative synthetic id for manual rows';
comment on column public.activities.raw_data is 'Strava API JSON and derived fields';
