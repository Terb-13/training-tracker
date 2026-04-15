import type { Database, Json } from "@/types/database";

type StrengthInsert = Database["public"]["Tables"]["strength_exercises"]["Insert"];

const KG_TO_LB = 2.2046226218;

/** Maps activity title / notes to Brett's three dumbbell splits (display strings). */
export function mapWorkoutName(activityName: string, notes?: string | null): string {
  const n = `${activityName} ${notes ?? ""}`.toLowerCase();
  if (n.includes("chest") || n.includes("tricep") || n.includes("push")) return "Chest & Triceps";
  if (n.includes("back") || n.includes("bicep") || n.includes("pull")) return "Back & Biceps";
  if (n.includes("shoulder") || n.includes("core") || n.includes("rotator")) return "Shoulders & Core";
  return "Strength (split)";
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function toFloat(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function weightToLbs(weight: number | null, unit: string | null): number | null {
  if (weight == null || !Number.isFinite(weight)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u.includes("kg") || u.includes("kilo") || u === "metric") return Math.round(weight * KG_TO_LB * 10) / 10;
  if (u.includes("stone")) return Math.round(weight * 14 * 10) / 10;
  return Math.round(weight * 10) / 10;
}

function pickWeightUnit(o: Record<string, unknown>): string | null {
  const u =
    o.weightUnit ??
    o.unit ??
    o.unitKey ??
    o.preferredWeightUnit ??
    o.weightUnitKey;
  return typeof u === "string" ? u : null;
}

/**
 * Garmin Connect exposes `summarizedExerciseSets` as vendor-specific JSON.
 * We walk common shapes defensively and fall back to lap summaries / session totals.
 */
function parseSummarizedExerciseSets(
  raw: unknown,
  workoutName: string,
  activityName: string,
): Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] {
  const out: Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] = [];

  const pushRow = (
    exerciseName: string,
    setNumber: number,
    reps: number | null,
    weightLbs: number | null,
    sortIndex: number,
    fragment: unknown,
  ) => {
    out.push({
      activity_name: activityName,
      workout_name: workoutName,
      exercise_name: exerciseName || "Exercise",
      set_number: setNumber,
      reps,
      weight_lbs: weightLbs,
      sort_index: sortIndex,
      raw: (fragment ?? null) as Json,
    });
  };

  const visitBlock = (block: unknown, depth: number): void => {
    if (depth > 8 || block == null || typeof block !== "object") return;
    const b = block as Record<string, unknown>;
    const name = String(
      b.exerciseName ?? b.exerciseNameKey ?? b.name ?? b.displayName ?? b.label ?? "Exercise",
    ).trim();

    const setCandidates = [b.sets, b.repSummaries, b.repSet, b.setList, b.repSetRepSummaries];
    for (const sets of setCandidates) {
      if (!Array.isArray(sets) || sets.length === 0) continue;
      sets.forEach((set, idx) => {
        if (set == null || typeof set !== "object") return;
        const s = set as Record<string, unknown>;
        const reps = toInt(s.reps ?? s.repCount ?? s.count ?? s.totalReps ?? s.rep);
        const wRaw = toFloat(s.weight ?? s.weightValue ?? s.value ?? s.weightKg ?? s.weightInKg);
        const wLbs = weightToLbs(wRaw, pickWeightUnit(s));
        pushRow(name, idx + 1, reps, wLbs, out.length, set);
      });
      return;
    }

    const singleReps = toInt(b.reps ?? b.repCount ?? b.totalReps);
    const wRaw = toFloat(b.weight ?? b.weightValue);
    if (singleReps != null || wRaw != null) {
      pushRow(name, 1, singleReps, weightToLbs(wRaw, pickWeightUnit(b)), out.length, block);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach((item) => visitBlock(item, 0));
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.exercises)) o.exercises.forEach((e) => visitBlock(e, 0));
    else if (Array.isArray(o.exerciseSets)) o.exerciseSets.forEach((e) => visitBlock(e, 0));
    else visitBlock(raw, 0);
  }

  return out;
}

function parseSplitSummaries(
  raw: unknown,
  workoutName: string,
  activityName: string,
  baseSort: number,
): Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] = [];
  raw.forEach((sp, i) => {
    if (sp == null || typeof sp !== "object") return;
    const s = sp as Record<string, unknown>;
    const reps = toInt(s.totalExerciseReps);
    const label = String(s.splitType ?? `Block ${i + 1}`).trim() || `Block ${i + 1}`;
    out.push({
      activity_name: activityName,
      workout_name: workoutName,
      exercise_name: label,
      set_number: i + 1,
      reps,
      weight_lbs: null,
      sort_index: baseSort + i,
      raw: sp as Json,
    });
  });
  return out;
}

function sessionFallbackRow(
  merged: Record<string, unknown>,
  workoutName: string,
  activityName: string,
): Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] {
  const totalReps = toInt(merged.totalReps);
  const totalSets = toInt(merged.totalSets ?? merged.activeSets);
  const name = String(activityName || merged.activityName || "Dumbbell session").trim() || "Dumbbell session";
  return [
    {
      activity_name: activityName,
      workout_name: workoutName,
      exercise_name: totalSets != null && totalSets > 1 ? `${name} (${totalSets} sets)` : name,
      set_number: 1,
      reps: totalReps,
      weight_lbs: null,
      sort_index: 0,
      raw: {
        totalReps: merged.totalReps ?? null,
        totalSets: merged.totalSets ?? null,
        activeSets: merged.activeSets ?? null,
      } as Json,
    },
  ];
}

/** Sum volume in kg from parsed rows (reps × weight), when weights exist. */
export function volumeKgFromRows(
  rows: Pick<StrengthInsert, "reps" | "weight_lbs">[],
): number | null {
  if (!rows.length) return null;
  let sumKg = 0;
  let any = false;
  for (const r of rows) {
    if (r.reps != null && r.weight_lbs != null) {
      any = true;
      sumKg += r.reps * r.weight_lbs * 0.453592;
    }
  }
  return any ? Math.round(sumKg) : null;
}

/**
 * Merge list + detail activity payloads (Garmin returns overlapping IActivity fields).
 * Optional FIT buffer parsing can be layered on later; see `parseStrengthFromFitBuffer`.
 */
export function parseStrengthGarminActivity(
  merged: Record<string, unknown>,
  userId: string,
  garminActivityId: number,
  activityNameFallback: string,
): StrengthInsert[] {
  const activityName = String(
    merged.activityName ?? merged.activity_name ?? activityNameFallback ?? "",
  ).trim();
  const notes =
    typeof merged.description === "string"
      ? merged.description
      : typeof merged.notes === "string"
        ? merged.notes
        : null;
  const workoutName = mapWorkoutName(activityName, notes);

  const summarized = merged.summarizedExerciseSets;
  let partial = parseSummarizedExerciseSets(summarized, workoutName, activityName);

  if (partial.length === 0 && merged.splitSummaries != null) {
    partial = parseSplitSummaries(merged.splitSummaries, workoutName, activityName, 0);
  }

  if (partial.length === 0) {
    partial = sessionFallbackRow(merged, workoutName, activityName);
  }

  return partial.map((p, i) => ({
    user_id: userId,
    garmin_activity_id: garminActivityId,
    ...p,
    sort_index: i,
  }));
}

/**
 * Reserved for FIT file buffers (e.g. from `downloadOriginalActivityData`).
 * Garmin’s REST payloads already include set summaries; FIT parsing can be added with a binary decoder when needed.
 */
export function parseStrengthFromFitBuffer(_buf: Buffer): StrengthInsert[] {
  return [];
}
