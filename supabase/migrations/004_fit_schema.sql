-- FIT-derived columns (from Garmin .FIT via @garmin/fitsdk; field inventory from fitparse on the 5 sample ACTIVITY.fit files in-repo).
--
-- Union field names (record, session, lap, set) observed:
-- record: cadence, distance, enhanced_altitude, enhanced_speed, heart_rate, position_lat, position_long, power, speed, timestamp, unknown_107, unknown_134, unknown_135, unknown_136, unknown_143
-- session: avg_cadence, avg_fractional_cadence, avg_heart_rate, avg_power, avg_speed, avg_stance_time, avg_stance_time_percent, avg_stroke_count, avg_stroke_distance, avg_temperature, enhanced_avg_speed, enhanced_max_speed, event, event_group, event_type, first_lap_index, intensity_factor, left_right_balance, max_cadence, max_fractional_cadence, max_heart_rate, max_power, max_speed, max_temperature, message_index, nec_lat, nec_long, normalized_power, num_active_lengths, num_laps, pool_length, pool_length_unit, sport, sport_index, start_position_lat, start_position_long, start_time, sub_sport, swc_lat, swc_long, swim_stroke, threshold_power, timestamp, total_ascent, total_calories, total_cycles, total_descent, total_distance, total_elapsed_time, total_fractional_cycles, total_moving_time, total_timer_time, total_work, training_stress_score, trigger, unknown_*
-- lap: (subset on cycling laps) avg_cadence, avg_heart_rate, avg_power, avg_speed, end_position_lat, end_position_long, enhanced_*, event, event_group, event_type, intensity, lap_trigger, max_*, message_index, normalized_power, num_lengths, sport, start_position_lat, start_position_long, start_time, sub_sport, swim_stroke, timestamp, total_*, unknown_*, wkt_step_index
-- set: category, category_subtype, duration, message_index, repetitions, set_type, start_time, timestamp, unknown_*, weight, weight_display_unit, wkt_step_index
--
-- Typed columns below cover session-level metrics; full message payloads live in raw_data JSONB.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'raw'
  ) then
    alter table public.activities rename column raw to raw_data;
  end if;
end $$;

alter table public.activities
  add column if not exists fit_sport text,
  add column if not exists fit_sub_sport text,
  add column if not exists max_hr integer,
  add column if not exists total_work_j bigint,
  add column if not exists normalized_power integer,
  add column if not exists training_stress_score numeric,
  add column if not exists total_ascent_m numeric,
  add column if not exists total_descent_m numeric,
  add column if not exists num_laps integer,
  add column if not exists total_timer_time_sec numeric;

comment on column public.activities.raw_data is 'Garmin API activity JSON + FIT summary; safety net for unknown / future fields';
comment on column public.activities.fit_sport is 'FIT session sport (e.g. cycling, training)';
comment on column public.activities.fit_sub_sport is 'FIT session sub_sport (e.g. indoorCycling, strengthTraining)';

alter table public.strength_exercises
  add column if not exists weight_kg numeric,
  add column if not exists rest_seconds integer,
  add column if not exists notes text;

comment on column public.strength_exercises.weight_kg is 'Per-set weight in kg when known (from FIT weight + unit)';
comment on column public.strength_exercises.rest_seconds is 'Rest interval after this set when the next FIT set message is rest';
comment on column public.strength_exercises.notes is 'Optional coach text from FIT workout_step notes';
