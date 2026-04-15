-- Per-set strength rows from Garmin summarizedExerciseSets / laps (and optional FIT later)

create table if not exists public.strength_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  garmin_activity_id bigint not null,
  activity_name text,
  workout_name text not null,
  exercise_name text not null,
  set_number int not null default 1,
  reps int,
  weight_lbs numeric,
  sort_index int not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, garmin_activity_id, sort_index)
);

create index if not exists strength_exercises_user_activity_idx
  on public.strength_exercises (user_id, garmin_activity_id);

alter table public.strength_exercises enable row level security;

drop policy if exists "strength_exercises_own" on public.strength_exercises;
create policy "strength_exercises_own" on public.strength_exercises for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
