-- Canonical full snapshots for strength (typed columns remain best-effort).
alter table public.strength_sessions
  add column if not exists raw_data jsonb;

alter table public.strength_exercises
  add column if not exists raw_data jsonb;

comment on column public.strength_sessions.raw_data is 'Full Garmin + FIT + summary; survives missing typed columns';
comment on column public.strength_exercises.raw_data is 'Per-set full snapshot; mirrors raw when both exist';
