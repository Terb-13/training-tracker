alter table public.daily_deficit
  add column if not exists raw_data jsonb;

comment on column public.daily_deficit.raw_data is 'Full computed snapshot + extras; survives missing typed columns';
