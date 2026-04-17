import type { Json } from "@/types/database";

import { jsonSafe } from "@/lib/sync/parse-fit";

/** Insert-shaped keys we send to PostgREST; unknown keys are merged into JSON blobs, never sent as columns. */
const ACTIVITY_INSERT_KEYS = new Set([
  "id",
  "user_id",
  "garmin_activity_id",
  "activity_type",
  "activity_name",
  "start_time_gmt",
  "duration_sec",
  "distance_m",
  "calories",
  "avg_hr",
  "max_hr",
  "max_power",
  "avg_power",
  "elevation_gain_m",
  "sport_type_key",
  "fit_sport",
  "fit_sub_sport",
  "total_work_j",
  "normalized_power",
  "training_stress_score",
  "total_ascent_m",
  "total_descent_m",
  "num_laps",
  "total_timer_time_sec",
  "raw_data",
  "raw",
  "created_at",
]);

const STRENGTH_SESSION_INSERT_KEYS = new Set([
  "id",
  "user_id",
  "garmin_activity_id",
  "label",
  "started_at",
  "duration_sec",
  "volume_kg",
  "exercise_summary",
  "raw_data",
  "created_at",
]);

const STRENGTH_EXERCISE_INSERT_KEYS = new Set([
  "id",
  "user_id",
  "garmin_activity_id",
  "activity_name",
  "workout_name",
  "exercise_name",
  "set_number",
  "reps",
  "weight_lbs",
  "weight_kg",
  "rest_seconds",
  "notes",
  "sort_index",
  "raw",
  "raw_data",
  "created_at",
]);

function mergeJsonBlob(existing: unknown, extras: Record<string, unknown>): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return jsonSafe({ ...base, ...extras }) as Json;
}

/**
 * Keep only known columns; merge stripped keys into raw_data (canonical) or legacy `raw`.
 */
export function sanitizeActivityInsert(row: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (ACTIVITY_INSERT_KEYS.has(k)) picked[k] = v;
    else extra[k] = v;
  }
  const existing = picked.raw_data ?? picked.raw;
  const blob = mergeJsonBlob(existing, extra);
  delete picked.raw;
  picked.raw_data = blob;
  return picked;
}

/** Full session snapshot in raw_data; typed columns stay when present. */
export function sanitizeStrengthSessionInsert(row: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRENGTH_SESSION_INSERT_KEYS.has(k)) picked[k] = v;
    else extra[k] = v;
  }
  const existing = picked.raw_data;
  const blob = mergeJsonBlob(existing, {
    ...extra,
    exercise_summary: picked.exercise_summary ?? null,
  });
  picked.raw_data = blob;
  return picked;
}

/** Merge unknown columns into raw and raw_data (same snapshot). */
export function sanitizeStrengthExerciseInsert(row: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRENGTH_EXERCISE_INSERT_KEYS.has(k)) picked[k] = v;
    else extra[k] = v;
  }
  const existing = picked.raw_data ?? picked.raw;
  const blob = mergeJsonBlob(existing, extra);
  picked.raw = blob;
  picked.raw_data = blob;
  return picked;
}
