import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Replace activities for the given Garmin IDs: delete existing rows, then insert.
 * Avoids ON CONFLICT (requires a matching unique constraint). Column tolerance matches
 * older schemas (raw_data vs raw, strip unknown columns).
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

  let current = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 48; attempt++) {
    const { error } = await supabase.from("activities").insert(current as never);
    if (!error) return;
    const col = extractMissingColumnName(error.message);
    if (!col) throw new Error(error.message);
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
    current = current.map((r) => {
      const next = { ...r };
      delete next[col];
      return next;
    });
  }
  throw new Error("activities insert: exceeded retries resolving schema columns");
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
    let chunk = rows.slice(j, j + 200).map((r) => ({ ...r }));
    for (let attempt = 0; ; attempt++) {
      if (attempt >= 48) throw new Error("strength_exercises insert: exceeded retries");
      const { error } = await supabase.from("strength_exercises").insert(chunk as never);
      if (!error) break;
      const col = extractMissingColumnName(error.message);
      if (!col) throw new Error(error.message);
      chunk = chunk.map((r) => {
        const next = { ...r };
        delete next[col];
        return next;
      });
    }
  }
}
