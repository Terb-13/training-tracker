/**
 * Garmin-related batch writes: delete-then-insert for data tables; profile sync uses UPDATE only.
 * No PostgREST .upsert / ON CONFLICT (guarded by `npm run check:no-upsert`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  pickProfileGarminUpdate,
  sanitizeActivityInsert,
  sanitizeBodyCompositionInsert,
  sanitizeDailyDeficitInsert,
  sanitizeStrengthExerciseInsert,
  sanitizeStrengthSessionInsert,
} from "@/lib/sync/schema-insert";

/** PostgREST / Postgres column-mismatch messages we normalize into a key to strip or swap. */
export function extractMissingColumnName(message: string): string | null {
  const patterns: RegExp[] = [
    /Could not find the '([^']+)' column/i,
    /Could not find the "([^"]+)" column/i,
    /column\s+["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s+does not exist/i,
    /["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s+column\s+of/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Insert after whitelist sanitize; if the live DB is behind generated types, drop missing columns and retry.
 */
async function insertRowsAdaptive(
  supabase: SupabaseClient,
  table:
    | "activities"
    | "strength_sessions"
    | "strength_exercises"
    | "body_composition"
    | "daily_deficit",
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  let current = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 48; attempt++) {
    const { error } = await supabase.from(table).insert(current as never);
    if (!error) return;
    const col = extractMissingColumnName(error.message);
    if (!col) throw new Error(error.message);

    if (table === "activities") {
      if (col === "raw_data" && current.some((r) => Object.prototype.hasOwnProperty.call(r, "raw_data"))) {
        current = current.map((r) => {
          const { raw_data: rd, ...rest } = r;
          return { ...rest, raw: rd };
        });
        continue;
      }
      if (col === "raw" && current.some((r) => Object.prototype.hasOwnProperty.call(r, "raw"))) {
        current = current.map((r) => {
          const { raw: legacy, ...rest } = r;
          return { ...rest, raw_data: legacy };
        });
        continue;
      }
    }

    current = current.map((r) => {
      const next = { ...r };
      delete next[col];
      return next;
    });
  }
  throw new Error(`${table} insert: exceeded adaptive retries`);
}

/** Delete existing rows for user + dates, then insert (no ON CONFLICT). */
export async function replaceBodyCompositionTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  const userId = rows[0].user_id as string | undefined;
  if (!userId || rows.some((r) => r.user_id !== userId)) {
    throw new Error("replaceBodyCompositionTolerant: all rows must share the same user_id");
  }
  const dates = [...new Set(rows.map((r) => String(r.date)))];
  const { error: delErr } = await supabase
    .from("body_composition")
    .delete()
    .eq("user_id", userId)
    .in("date", dates);
  if (delErr) throw new Error(delErr.message);

  const sanitized = rows.map((r) => sanitizeBodyCompositionInsert({ ...r }));
  await insertRowsAdaptive(supabase, "body_composition", sanitized);
}

/** Delete existing rows for user + dates, then insert (no ON CONFLICT). */
export async function replaceDailyDeficitTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  const userId = rows[0].user_id as string | undefined;
  if (!userId || rows.some((r) => r.user_id !== userId)) {
    throw new Error("replaceDailyDeficitTolerant: all rows must share the same user_id");
  }
  const dates = [...new Set(rows.map((r) => String(r.date)))];
  const { error: delErr } = await supabase
    .from("daily_deficit")
    .delete()
    .eq("user_id", userId)
    .in("date", dates);
  if (delErr) throw new Error(delErr.message);

  const sanitized = rows.map((r) => sanitizeDailyDeficitInsert({ ...r }));
  await insertRowsAdaptive(supabase, "daily_deficit", sanitized);
}

/** Update profile fields allowed on Garmin sync; strips unknown columns until PostgREST accepts. */
export async function updateProfileGarminTolerant(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  let current = pickProfileGarminUpdate(patch);
  if (Object.keys(current).length === 0) return;
  for (let attempt = 0; attempt < 48; attempt++) {
    const { error } = await supabase.from("profiles").update(current as never).eq("id", userId);
    if (!error) return;
    const col = extractMissingColumnName(error.message);
    if (!col) throw new Error(error.message);
    const next = { ...current };
    delete next[col];
    current = next;
    if (Object.keys(current).length === 0) return;
  }
  throw new Error("profiles update: exceeded adaptive retries");
}

/**
 * Replace activities: delete by Garmin IDs, insert whitelist-sanitized rows (full payload in raw_data).
 */
export async function replaceActivitiesTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  const userId = rows[0].user_id as string | undefined;
  if (!userId || rows.some((r) => r.user_id !== userId)) {
    throw new Error("replaceActivitiesTolerant: all rows must share the same user_id");
  }
  const garminIds = [...new Set(rows.map((r) => r.garmin_activity_id as number))];
  const { error: delErr } = await supabase
    .from("activities")
    .delete()
    .eq("user_id", userId)
    .in("garmin_activity_id", garminIds);
  if (delErr) throw new Error(delErr.message);

  const sanitized = rows.map((r) => sanitizeActivityInsert({ ...r }));
  await insertRowsAdaptive(supabase, "activities", sanitized);
}

export async function replaceStrengthSessionsTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  const userId = rows[0].user_id as string | undefined;
  if (!userId || rows.some((r) => r.user_id !== userId)) {
    throw new Error("replaceStrengthSessionsTolerant: all rows must share the same user_id");
  }
  const garminIds = [...new Set(rows.map((r) => r.garmin_activity_id as number))];
  const { error: delErr } = await supabase
    .from("strength_sessions")
    .delete()
    .eq("user_id", userId)
    .in("garmin_activity_id", garminIds);
  if (delErr) throw new Error(delErr.message);

  const sanitized = rows.map((r) => sanitizeStrengthSessionInsert({ ...r }));
  await insertRowsAdaptive(supabase, "strength_sessions", sanitized);
}

export async function insertStrengthExercisesTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  const userId = rows[0].user_id as string | undefined;
  if (!userId || rows.some((r) => r.user_id !== userId)) {
    throw new Error("insertStrengthExercisesTolerant: all rows must share the same user_id");
  }
  const garminIds = [...new Set(rows.map((r) => Number(r.garmin_activity_id)))];
  const { error: delErr } = await supabase
    .from("strength_exercises")
    .delete()
    .eq("user_id", userId)
    .in("garmin_activity_id", garminIds);
  if (delErr) throw new Error(delErr.message);

  for (let j = 0; j < rows.length; j += 200) {
    const chunk = rows.slice(j, j + 200).map((r) => sanitizeStrengthExerciseInsert({ ...r }));
    await insertRowsAdaptive(supabase, "strength_exercises", chunk);
  }
}
