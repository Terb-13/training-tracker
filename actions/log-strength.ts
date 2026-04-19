"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonSafe } from "@/lib/sync/json-safe";
import type { Database } from "@/types/database";

const SPLITS = ["Chest & Triceps", "Back & Biceps", "Shoulders & Core"] as const;

const LB_TO_KG = 0.453592;

export async function logStrengthSession(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const workout = (formData.get("workout") as string | null)?.trim() ?? "";
  if (!(SPLITS as readonly string[]).includes(workout)) {
    return { ok: false, error: "Pick a workout split" };
  }

  const linesRaw = (formData.get("sets_json") as string | null)?.trim() ?? "[]";
  let lines: { exercise: string; reps: number; weight_lbs: number }[];
  try {
    const parsed = JSON.parse(linesRaw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("bad shape");
    lines = parsed.map((row) => {
      const o = row as Record<string, unknown>;
      return {
        exercise: String(o.exercise ?? "").trim() || "Exercise",
        reps: Number(o.reps),
        weight_lbs: Number(o.weight_lbs),
      };
    });
  } catch {
    return { ok: false, error: "Invalid sets payload" };
  }

  const valid = lines.filter(
    (l) =>
      l.exercise.length > 0 &&
      Number.isFinite(l.reps) &&
      l.reps > 0 &&
      Number.isFinite(l.weight_lbs) &&
      l.weight_lbs >= 0,
  );
  if (valid.length === 0) {
    return { ok: false, error: "Add at least one set with reps and weight" };
  }

  const external_activity_id = -Math.abs(Date.now());
  const started_at = new Date().toISOString();
  let volKg = 0;
  for (const l of valid) {
    volKg += l.reps * l.weight_lbs * LB_TO_KG;
  }
  volKg = Math.round(volKg * 10) / 10;
  const duration_sec = Math.min(7200, Math.max(300, valid.length * 90));

  const sessionRow: Database["public"]["Tables"]["strength_sessions"]["Insert"] = {
    user_id: user.id,
    external_activity_id,
    label: workout,
    started_at,
    duration_sec,
    volume_kg: volKg,
    exercise_summary: jsonSafe({ split: workout, sets: valid.length, source: "manual" }),
    raw_data: jsonSafe({ source: "manual", sets: valid }),
  };

  const { error: sErr } = await supabase.from("strength_sessions").insert(sessionRow);
  if (sErr) return { ok: false, error: sErr.message };

  const exerciseRows: Database["public"]["Tables"]["strength_exercises"]["Insert"][] = valid.map(
    (l, idx) => ({
      user_id: user.id,
      external_activity_id,
      activity_name: workout,
      workout_name: workout,
      exercise_name: l.exercise,
      set_number: idx + 1,
      reps: l.reps,
      weight_lbs: l.weight_lbs,
      weight_kg: Math.round(l.weight_lbs * LB_TO_KG * 1000) / 1000,
      rest_seconds: null,
      notes: null,
      sort_index: idx,
      raw_data: jsonSafe({ source: "manual" }),
    }),
  );

  const { error: eErr } = await supabase.from("strength_exercises").insert(exerciseRows);
  if (eErr) return { ok: false, error: eErr.message };

  return { ok: true };
}
