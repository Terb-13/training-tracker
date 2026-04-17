import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { subDays } from "date-fns";
import { GarminConnect } from "garmin-connect";
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptJson, encryptJson } from "@/lib/crypto/credentials";
import type { Database, Json } from "@/types/database";
import {
  encodeFullActivityRawData,
  extractFitFromZipBuffer,
  isStrengthFitSession,
  jsonSafe,
  mapWorkoutNameFromFitWktName,
  parseGarminActivityFit,
  sessionToActivityFields,
  type ParsedGarminFit,
} from "@/lib/sync/parse-fit";
import {
  mapWorkoutName,
  parseStrengthGarminActivity,
  volumeKgFromRows,
} from "@/lib/sync/parse-strength";
import {
  insertStrengthExercisesTolerant,
  replaceActivitiesTolerant,
  replaceStrengthSessionsTolerant,
} from "@/lib/sync/supabase-tolerant";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type OAuthTokens = { oauth1: unknown; oauth2: unknown };

/** Narrow shape from garmin-connect activity list (avoids brittle deep imports). */
type GarminActivity = {
  activityId: number;
  activityName: string;
  activityType: { typeKey: string };
  startTimeGMT: string;
  startTimeLocal: string;
  duration: number;
  distance: number;
  calories: number;
  averageHR: number;
  elevationGain: number;
  avgPower: unknown;
  maxPower: unknown;
  description?: unknown;
  summarizedExerciseSets?: unknown;
  totalReps?: unknown;
  totalSets?: unknown;
  activeSets?: unknown;
  splitSummaries?: unknown;
};

function classifySport(a: GarminActivity): "cycling" | "strength" | "other" {
  const key = a.activityType?.typeKey?.toLowerCase() ?? "";
  const name = a.activityName?.toLowerCase() ?? "";
  if (key.includes("cycling") || name.includes("bike") || name.includes("peloton")) return "cycling";
  if (key.includes("strength") || name.includes("strength")) return "strength";
  if (key.includes("fitness_equipment") || key.includes("indoor_cardio")) {
    if (name.includes("chest") || name.includes("back") || name.includes("shoulder") || name.includes("dumbbell"))
      return "strength";
    if (a.distance < 500 && a.duration > 120) return "strength";
  }
  if (name.includes("dumbbell") || name.includes("lift")) return "strength";
  return "other";
}

function isStrengthActivity(a: GarminActivity): boolean {
  return classifySport(a) === "strength";
}

function shouldSyncStrengthDetail(a: GarminActivity, parsed: ParsedGarminFit | null | undefined): boolean {
  if (parsed?.strengthRows?.length) return true;
  if (parsed?.session && isStrengthFitSession(parsed.session as Record<string, unknown>)) return true;
  return isStrengthActivity(a);
}

async function downloadFitBuffer(gc: GarminConnect, activityId: number): Promise<Buffer | null> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-fit-"));
  try {
    await gc.downloadOriginalActivityData({ activityId }, tmp, "zip");
    const zipPath = path.join(tmp, `${activityId}.zip`);
    if (!fs.existsSync(zipPath)) return null;
    return extractFitFromZipBuffer(fs.readFileSync(zipPath));
  } catch {
    return null;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function parseActivityDate(a: GarminActivity): Date {
  const s = a.startTimeGMT || a.startTimeLocal;
  return new Date(s);
}

function bmrMaleKg(weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

async function ensureGarminSession(profile: Profile): Promise<GarminConnect> {
  const email = profile.garmin_email?.trim();
  if (!email) {
    throw new Error("Add Garmin email in Settings");
  }

  const gc = new GarminConnect({ username: email, password: "" });

  if (profile.garmin_tokens_encrypted) {
    try {
      const tokens = decryptJson<OAuthTokens>(profile.garmin_tokens_encrypted);
      gc.loadToken(tokens.oauth1 as never, tokens.oauth2 as never);
      await gc.getActivities(0, 1);
      return gc;
    } catch {
      /* fall through to password login */
    }
  }

  if (!profile.garmin_password_encrypted) {
    throw new Error("Add Garmin password in Settings (or reconnect after token expiry)");
  }

  const { password } = decryptJson<{ password: string }>(profile.garmin_password_encrypted);
  await gc.login(email, password);
  const exported = gc.exportToken();
  return gc;
}

export async function runGarminSync(
  userId: string,
  supabase: SupabaseClient<Database>,
  profileRow: Profile,
): Promise<{ ok: true; message: string; counts: Record<string, number> } | { ok: false; error: string }> {
  try {
    const gc = await ensureGarminSession(profileRow);

    const now = new Date();
    const since = subDays(now, 7);

    const activities = (await gc.getActivities(0, 200)) as GarminActivity[];
    const recent = activities.filter((a) => parseActivityDate(a) >= since);

    const fitById = new Map<number, ParsedGarminFit | null>();
    for (let b = 0; b < recent.length; b += 4) {
      const slice = recent.slice(b, b + 4);
      const batchFit = await Promise.all(
        slice.map(async (a) => {
          const buf = await downloadFitBuffer(gc, a.activityId);
          const parsed = buf ? await parseGarminActivityFit(buf) : null;
          return { id: a.activityId, parsed };
        }),
      );
      for (const { id, parsed } of batchFit) fitById.set(id, parsed);
    }

    const activityRows: Record<string, unknown>[] = recent.map((a) => {
      const parsed = fitById.get(a.activityId) ?? null;
      const fit = sessionToActivityFields(parsed?.session ?? null);
      const rawPayload = encodeFullActivityRawData(a, parsed?.rawDataFit ?? null, fit as Record<string, unknown>);
      return {
        user_id: userId,
        garmin_activity_id: a.activityId,
        activity_type: a.activityType?.typeKey ?? null,
        activity_name: a.activityName ?? "",
        start_time_gmt: fit.start_time_gmt ?? parseActivityDate(a).toISOString(),
        duration_sec: fit.duration_sec ?? Math.round(a.duration ?? 0),
        distance_m: fit.distance_m ?? a.distance ?? null,
        calories: fit.calories ?? a.calories ?? null,
        avg_hr: fit.avg_hr ?? a.averageHR ?? null,
        max_hr: fit.max_hr,
        max_power: fit.max_power ?? (typeof a.maxPower === "number" ? a.maxPower : null),
        avg_power: fit.avg_power ?? (typeof a.avgPower === "number" ? a.avgPower : null),
        elevation_gain_m: fit.elevation_gain_m ?? a.elevationGain ?? null,
        sport_type_key: a.activityType?.typeKey ?? null,
        fit_sport: fit.fit_sport,
        fit_sub_sport: fit.fit_sub_sport,
        total_work_j: fit.total_work_j,
        normalized_power: fit.normalized_power,
        training_stress_score: fit.training_stress_score,
        total_ascent_m: fit.total_ascent_m,
        total_descent_m: fit.total_descent_m,
        num_laps: fit.num_laps,
        total_timer_time_sec: fit.total_timer_time_sec,
        raw_data: rawPayload,
      };
    });

    if (activityRows.length) {
      await replaceActivitiesTolerant(supabase, activityRows);
    }

    const strength = recent.filter((a) => shouldSyncStrengthDetail(a, fitById.get(a.activityId) ?? null));

    type ParsedBundle = {
      activity: GarminActivity;
      rows: Database["public"]["Tables"]["strength_exercises"]["Insert"][];
    };
    const bundles: ParsedBundle[] = [];
    const batchSize = 5;
    for (let i = 0; i < strength.length; i += batchSize) {
      const batch = strength.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (a) => {
          const parsed = fitById.get(a.activityId) ?? null;
          if (parsed?.strengthRows?.length) {
            const rows: Database["public"]["Tables"]["strength_exercises"]["Insert"][] = parsed.strengthRows.map(
              (r, idx) => ({
                user_id: userId,
                garmin_activity_id: a.activityId,
                ...r,
                activity_name: a.activityName ?? "",
                sort_index: idx,
              }),
            );
            return { activity: a, rows };
          }
          let detail: Record<string, unknown> | null = null;
          try {
            const d = (await gc.getActivity({ activityId: a.activityId })) as unknown;
            if (d && typeof d === "object") detail = d as Record<string, unknown>;
          } catch {
            detail = null;
          }
          const merged: Record<string, unknown> = {
            ...(a as unknown as Record<string, unknown>),
            ...(detail ?? {}),
          };
          const rows = parseStrengthGarminActivity(merged, userId, a.activityId, a.activityName || "Strength");
          return { activity: a, rows };
        }),
      );
      bundles.push(...results);
    }

    const strengthRows = bundles.map(({ activity: a, rows }) => {
      const parsed = fitById.get(a.activityId) ?? null;
      const fromSets = volumeKgFromRows(rows);
      const vol = fromSets ?? Math.round((a.duration / 60) * 8);
      const fit = sessionToActivityFields(parsed?.session ?? null);
      const label = parsed?.workoutWktName
        ? mapWorkoutNameFromFitWktName(parsed.workoutWktName)
        : mapWorkoutName(a.activityName || "Strength");
      const exerciseSummary = {
        name: a.activityName,
        typeKey: a.activityType?.typeKey,
        setRows: rows.length,
        source: parsed?.strengthRows?.length ? "fit" : "garmin_api",
      } as Json;
      const rawData = jsonSafe({
        garminActivity: a,
        parsedFit: parsed
          ? {
              session: parsed.session,
              strengthRows: parsed.strengthRows,
              rawDataFit: parsed.rawDataFit,
              workoutWktName: parsed.workoutWktName,
            }
          : null,
        exerciseSummary,
      });
      return {
        user_id: userId,
        garmin_activity_id: a.activityId,
        label,
        started_at: fit.start_time_gmt ?? parseActivityDate(a).toISOString(),
        duration_sec: fit.duration_sec ?? Math.round(a.duration ?? 0),
        volume_kg: vol,
        exercise_summary: exerciseSummary,
        raw_data: rawData,
      };
    });

    const flatExercises = bundles.flatMap((b) => b.rows);

    if (strengthRows.length) {
      await replaceStrengthSessionsTolerant(
        supabase,
        strengthRows.map((r) => ({ ...r }) as Record<string, unknown>),
      );
    }

    if (flatExercises.length) {
      await insertStrengthExercisesTolerant(
        supabase,
        flatExercises.map((r) => ({ ...r }) as Record<string, unknown>),
      );
    }

    const bodyRows: Database["public"]["Tables"]["body_composition"]["Insert"][] = [];
    for (let d = 0; d <= 7; d++) {
      const day = subDays(now, d);
      try {
        const w = await gc.getDailyWeightInPounds(day);
        bodyRows.push({
          user_id: userId,
          date: day.toISOString().slice(0, 10),
          weight_lbs: w,
          body_fat_pct: null,
          muscle_mass_lbs: null,
          source: "garmin",
          raw: null,
        });
      } catch {
        /* no weight that day */
      }
    }

    if (bodyRows.length) {
      const { error: bErr } = await supabase.from("body_composition").upsert(bodyRows, {
        onConflict: "user_id,date",
      });
      if (bErr) throw new Error(bErr.message);
    }

    let sleepHours = 6.5;
    try {
      const dur = await gc.getSleepDuration(now);
      sleepHours = dur.hours + dur.minutes / 60;
    } catch {
      /* keep default */
    }

    let restingHr = 55;
    try {
      const hr = await gc.getHeartRate(now);
      const values = (hr as { restingHeartRate?: number }).restingHeartRate;
      if (typeof values === "number") restingHr = values;
    } catch {
      /* default */
    }

    const { data: profileFresh } = await supabase.from("profiles").select("*").eq("id", userId).single();

    const maxWeightLb =
      bodyRows.length > 0
        ? Math.max(...bodyRows.map((r) => Number(r.weight_lbs)))
        : Number(profileFresh?.starting_weight_lbs ?? 204.2);
    const weightKg = maxWeightLb * 0.453592;

    const heightCm = profileFresh?.height_cm ?? 170;
    const age = profileFresh?.age ?? 33;
    const resting = Math.round(bmrMaleKg(weightKg, heightCm, age) * 1.25);

    const byDay = new Map<string, number>();
    for (const a of recent) {
      const day = parseActivityDate(a).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (a.calories ?? 0));
    }

    const target = profileFresh?.target_calories ?? 3000;

    const { data: projLoss } = await supabase.rpc("calculate_projected_loss", { p_user_id: userId });

    const deficitRows: Database["public"]["Tables"]["daily_deficit"]["Insert"][] = [];
    for (let d = 0; d <= 7; d++) {
      const day = subDays(now, d);
      const key = day.toISOString().slice(0, 10);
      const active = Math.round(byDay.get(key) ?? 0);
      const deficit = target - (active + resting);

      deficitRows.push({
        user_id: userId,
        date: key,
        active_calories: active,
        resting_calories_est: resting,
        calories_in: null,
        deficit_kcal: deficit,
        projected_weekly_loss_lbs: projLoss ?? null,
      });
    }

    const { error: dErr } = await supabase.from("daily_deficit").upsert(deficitRows, {
      onConflict: "user_id,date",
    });
    if (dErr) throw new Error(dErr.message);

    const exported = gc.exportToken();
    const encryptedTokens = encryptJson({
      oauth1: exported.oauth1,
      oauth2: exported.oauth2,
    });

    const recoveryScore = Math.min(
      100,
      Math.round(38 + sleepHours * 7.5 + Math.max(0, 62 - restingHr) * 0.35),
    );
    const garminWellness: Json = {
      sleepHours: Math.round(sleepHours * 10) / 10,
      hrvMs: 52,
      restingHr,
      recoveryScore,
    };

    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        garmin_tokens_encrypted: encryptedTokens,
        garmin_last_sync_at: new Date().toISOString(),
        garmin_wellness: garminWellness,
      })
      .eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    console.log(
      `[Garmin sync] OK — ${activityRows.length} activities, ${flatExercises.length} strength_exercises inserted (raw_data used as fallback)`,
    );

    return {
      ok: true,
      message: "Garmin sync complete",
      counts: {
        activities: activityRows.length,
        strength: strengthRows.length,
        strength_exercises: flatExercises.length,
        weights: bodyRows.length,
        sleepHours: Math.round(sleepHours * 10) / 10,
        restingHr,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return { ok: false, error: msg };
  }
}
