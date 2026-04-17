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
 * Upsert activities until unknown columns are removed or raw_data/raw is swapped.
 * Extended metrics should live under raw_data (or raw) JSON; top-level keys are best-effort.
 */
export async function upsertActivitiesTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
  let current = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 48; attempt++) {
    const { error } = await supabase.from("activities").upsert(current as never, {
      onConflict: "user_id,garmin_activity_id",
    });
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
  throw new Error("activities upsert: exceeded retries resolving schema columns");
}

export async function insertStrengthExercisesTolerant(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!rows.length) return;
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
