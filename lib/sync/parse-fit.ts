import AdmZip from "adm-zip";

import type { Database, Json } from "@/types/database";

type StrengthInsert = Database["public"]["Tables"]["strength_exercises"]["Insert"];

const LB_TO_KG = 0.453592;

/** Garmin FIT uint16 “missing” sentinel when scale not applied */
const UINT16_INVALID = 65535;

function toIso(d: unknown): string | null {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export function encodeGarminActivityRawData(garminApi: unknown, fitPayload: Json | null): Json {
  return jsonSafe({ garminApi, fit: fitPayload }) as Json;
}

function jsonSafe(v: unknown): Json {
  try {
    return JSON.parse(
      JSON.stringify(v, (_k, x) => {
        if (x instanceof Date) return x.toISOString();
        if (typeof x === "number" && (!Number.isFinite(x) || Number.isNaN(x))) return null;
        if (typeof x === "bigint") return x.toString();
        return x;
      }),
    ) as Json;
  } catch {
    return null;
  }
}

function cleanWktStepName(raw: unknown): string {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t && !/[\x00-\x08\x0e-\x1f]/.test(t)) return t;
  }
  if (Array.isArray(raw)) {
    for (const part of raw) {
      if (typeof part === "string") {
        const t = part.trim();
        if (t && !/[\x00-\x08\x0e-\x1f]/.test(t)) return t;
      }
    }
  }
  return "Exercise";
}

function cleanUint16Power(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n <= 0 || n >= UINT16_INVALID) return null;
  return Math.round(n);
}

function cleanElevation(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n >= UINT16_INVALID || n < 0) return null;
  return n;
}

function weightToLbsKg(weight: unknown, unit: unknown): { lbs: number | null; kg: number | null } {
  if (typeof weight !== "number" || !Number.isFinite(weight)) return { lbs: null, kg: null };
  const u = String(unit ?? "").toLowerCase();
  if (u.includes("kilogram") || u.includes("kg")) {
    const kg = Math.round(weight * 1000) / 1000;
    return { lbs: Math.round((kg / LB_TO_KG) * 100) / 100, kg };
  }
  const lbs = Math.round(weight * 10000) / 10000;
  return { lbs, kg: Math.round(lbs * LB_TO_KG * 1000) / 1000 };
}

export function mapWorkoutNameFromFitWktName(wktName: unknown): string {
  const raw = Array.isArray(wktName) ? wktName.find((x) => typeof x === "string" && x.trim()) : wktName;
  const s = typeof raw === "string" ? raw.trim() : "";
  const n = s.toLowerCase();
  if (n.includes("chest") || n.includes("tricep") || n.includes("push") || n.includes("chest day"))
    return "Chest & Triceps";
  if (n.includes("back") || n.includes("bicep") || n.includes("pull")) return "Back & Biceps";
  if (n.includes("shoulder") || n.includes(" core") || n.includes("core ") || n === "shoulders & core")
    return "Shoulders & Core";
  if (s) return s;
  return "Strength (split)";
}

/** True when FIT session is strength training (matches sample FIT files). */
export function isStrengthFitSession(s: Record<string, unknown> | null | undefined): boolean {
  if (!s) return false;
  const sub = String(s.subSport ?? s.sub_sport ?? "").toLowerCase();
  const sport = String(s.sport ?? "").toLowerCase();
  return sub.includes("strength") || (sport === "training" && sub.includes("strength"));
}

function formatCategoryLabel(cat: unknown): string | null {
  if (Array.isArray(cat) && typeof cat[0] === "string") {
    const c = cat[0].replace(/([a-z])([A-Z])/g, "$1 $2");
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  if (typeof cat === "string") return cat;
  return null;
}

export type ParsedGarminFit = {
  session: Record<string, unknown> | null;
  rawDataFit: Json;
  workoutWktName: string | null;
  strengthRows: Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] | null;
};

export async function parseGarminActivityFit(buf: Buffer): Promise<ParsedGarminFit | null> {
  if (!buf?.length) return null;
  try {
    const { Decoder, Stream } = await import("@garmin/fitsdk");
    const stream = Stream.fromByteArray(new Uint8Array(buf));
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) return null;
    const { messages, errors } = decoder.read({
      convertDateTimesToDates: true,
      includeUnknownData: true,
    });
    if (errors?.length) {
      /* still use partial messages when decoder reports non-fatal issues */
    }

    const mesg = messages as {
      sessionMesgs?: unknown[];
      workoutMesgs?: unknown[];
      setMesgs?: unknown[];
      exerciseTitleMesgs?: unknown[];
      workoutStepMesgs?: unknown[];
      recordMesgs?: unknown[];
      lapMesgs?: unknown[];
      activityMesgs?: unknown[];
      fileIdMesgs?: unknown[];
    };

    const sessionMesg = (mesg.sessionMesgs?.[0] as Record<string, unknown> | undefined) ?? null;
    const wm = mesg.workoutMesgs?.[0] as { wktName?: unknown } | undefined;
    const wktRaw = wm?.wktName;
    const workoutWktName =
      typeof wktRaw === "string"
        ? wktRaw
        : Array.isArray(wktRaw)
          ? (wktRaw.find((x) => typeof x === "string" && x.trim()) as string | undefined) ?? null
          : null;

    const rawDataFit = jsonSafe({
      fileIdMesgs: mesg.fileIdMesgs,
      sessionMesgs: mesg.sessionMesgs,
      recordMesgsCount: mesg.recordMesgs?.length ?? 0,
      lapMesgsCount: mesg.lapMesgs?.length ?? 0,
      setMesgs: mesg.setMesgs,
      exerciseTitleMesgs: mesg.exerciseTitleMesgs,
      workoutMesgs: mesg.workoutMesgs,
      workoutStepMesgs: mesg.workoutStepMesgs,
      activityMesgs: mesg.activityMesgs,
      decoderErrors: errors,
    });

    let strengthRows: Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] | null = null;
    if (isStrengthFitSession(sessionMesg) && mesg.setMesgs?.length) {
      const titles = new Map<number, string>();
      for (const et of mesg.exerciseTitleMesgs ?? []) {
        const e = et as { messageIndex?: number; wktStepName?: unknown };
        if (typeof e.messageIndex === "number") {
          titles.set(e.messageIndex, cleanWktStepName(e.wktStepName));
        }
      }

      const stepsByIndex = new Map<number, { notes?: unknown }>();
      for (const st of mesg.workoutStepMesgs ?? []) {
        const s = st as { messageIndex?: number; notes?: unknown };
        if (typeof s.messageIndex === "number") stepsByIndex.set(s.messageIndex, s);
      }

      const sets = [...(mesg.setMesgs as object[])].sort(
        (a, b) =>
          ((a as { messageIndex?: number }).messageIndex ?? 0) -
          ((b as { messageIndex?: number }).messageIndex ?? 0),
      );

      const rows: Omit<StrengthInsert, "user_id" | "garmin_activity_id">[] = [];
      let sortIndex = 0;

      for (let i = 0; i < sets.length; i++) {
        const cur = sets[i] as Record<string, unknown>;
        const setType = String(cur.setType ?? "");
        if (setType !== "active") continue;

        const wktStep = typeof cur.wktStepIndex === "number" ? cur.wktStepIndex : 0;
        const title = titles.get(wktStep) ?? formatCategoryLabel(cur.category) ?? "Exercise";
        const step = stepsByIndex.get(wktStep);
        let notes: string | null = null;
        if (step?.notes != null) {
          const n = step.notes;
          if (Array.isArray(n) && typeof n[0] === "string") notes = n[0].slice(0, 2000);
          else if (typeof n === "string") notes = n.slice(0, 2000);
        }

        const next = sets[i + 1] as Record<string, unknown> | undefined;
        let restSeconds: number | null = null;
        if (next && String(next.setType ?? "") === "rest" && typeof next.duration === "number") {
          restSeconds = Math.round(next.duration);
        }

        const reps =
          typeof cur.repetitions === "number" && Number.isFinite(cur.repetitions)
            ? Math.round(cur.repetitions)
            : null;
        const { lbs, kg } = weightToLbsKg(cur.weight, cur.weightDisplayUnit);

        const setSerial = cur["14"];
        const setNumber =
          typeof setSerial === "number" && Number.isFinite(setSerial) ? Math.round(setSerial) + 1 : sortIndex + 1;

        rows.push({
          activity_name: null,
          workout_name: mapWorkoutNameFromFitWktName(wktRaw),
          exercise_name: title,
          set_number: setNumber,
          reps,
          weight_lbs: lbs,
          weight_kg: kg,
          rest_seconds: restSeconds,
          notes,
          sort_index: sortIndex,
          raw: jsonSafe(cur),
        });
        sortIndex += 1;
      }

      strengthRows = rows.length ? rows : null;
    }

    return {
      session: sessionMesg,
      rawDataFit,
      workoutWktName,
      strengthRows,
    };
  } catch {
    return null;
  }
}

export function sessionToActivityFields(session: Record<string, unknown> | null): {
  fit_sport: string | null;
  fit_sub_sport: string | null;
  start_time_gmt: string | null;
  duration_sec: number | null;
  distance_m: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  max_power: number | null;
  elevation_gain_m: number | null;
  total_work_j: number | null;
  normalized_power: number | null;
  training_stress_score: number | null;
  total_ascent_m: number | null;
  total_descent_m: number | null;
  num_laps: number | null;
  total_timer_time_sec: number | null;
} {
  if (!session) {
    return {
      fit_sport: null,
      fit_sub_sport: null,
      start_time_gmt: null,
      duration_sec: null,
      distance_m: null,
      calories: null,
      avg_hr: null,
      max_hr: null,
      avg_power: null,
      max_power: null,
      elevation_gain_m: null,
      total_work_j: null,
      normalized_power: null,
      training_stress_score: null,
      total_ascent_m: null,
      total_descent_m: null,
      num_laps: null,
      total_timer_time_sec: null,
    };
  }

  const tel = session.totalElapsedTime ?? session.total_elapsed_time;
  const ttm = session.totalTimerTime ?? session.total_timer_time;
  const dur =
    typeof tel === "number"
      ? tel
      : typeof ttm === "number"
        ? ttm
        : null;

  const totalWork = session.totalWork ?? session.total_work;
  const tw =
    typeof totalWork === "number" && Number.isFinite(totalWork) && totalWork > 0 && totalWork < 1e12
      ? Math.round(totalWork)
      : null;

  const np = cleanUint16Power(session.normalizedPower ?? session.normalized_power);
  const tssRaw = session.trainingStressScore ?? session.training_stress_score;
  const tss =
    typeof tssRaw === "number" && Number.isFinite(tssRaw) && tssRaw > 0 && tssRaw < 1e4
      ? Math.round(tssRaw * 10) / 10
      : null;

  return {
    fit_sport: typeof session.sport === "string" ? session.sport : null,
    fit_sub_sport: typeof session.subSport === "string" ? session.subSport : null,
    start_time_gmt: toIso(session.startTime ?? session.start_time),
    duration_sec: typeof dur === "number" ? Math.round(dur) : null,
    distance_m: typeof session.totalDistance === "number" ? session.totalDistance : null,
    calories: typeof session.totalCalories === "number" ? Math.round(session.totalCalories) : null,
    avg_hr: typeof session.avgHeartRate === "number" ? Math.round(session.avgHeartRate) : null,
    max_hr: typeof session.maxHeartRate === "number" ? Math.round(session.maxHeartRate) : null,
    avg_power: cleanUint16Power(session.avgPower ?? session.avg_power),
    max_power: cleanUint16Power(session.maxPower ?? session.max_power),
    elevation_gain_m: cleanElevation(session.totalAscent ?? session.total_ascent),
    total_work_j: tw,
    normalized_power: np,
    training_stress_score: tss,
    total_ascent_m: cleanElevation(session.totalAscent ?? session.total_ascent),
    total_descent_m: cleanElevation(session.totalDescent ?? session.total_descent),
    num_laps: typeof session.numLaps === "number" ? Math.round(session.numLaps) : null,
    total_timer_time_sec: typeof session.totalTimerTime === "number" ? session.totalTimerTime : null,
  };
}

export function extractFitFromZipBuffer(zipBuffer: Buffer): Buffer | null {
  try {
    const zip = new AdmZip(zipBuffer);
    const fitEntry = zip
      .getEntries()
      .find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".fit"));
    return fitEntry ? Buffer.from(fitEntry.getData()) : null;
  } catch {
    return null;
  }
}
