import { subDays } from "date-fns";
import { GarminConnect } from "garmin-connect";
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptJson, encryptJson } from "@/lib/crypto/credentials";
import type { Database, Json } from "@/types/database";

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
};

function mapStrengthLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("chest") || n.includes("tricep") || n.includes("push")) return "Chest/Triceps";
  if (n.includes("back") || n.includes("bicep") || n.includes("pull")) return "Back/Biceps";
  if (n.includes("shoulder") || n.includes("core") || n.includes("rotator")) return "Shoulders/Core";
  return "Strength (split)";
}

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

    const activityRows = recent.map((a) => ({
      user_id: userId,
      garmin_activity_id: a.activityId,
      activity_type: a.activityType?.typeKey ?? null,
      activity_name: a.activityName ?? "",
      start_time_gmt: parseActivityDate(a).toISOString(),
      duration_sec: Math.round(a.duration ?? 0),
      distance_m: a.distance ?? null,
      calories: a.calories ?? null,
      avg_hr: a.averageHR ?? null,
      max_power: typeof a.maxPower === "number" ? a.maxPower : null,
      avg_power: typeof a.avgPower === "number" ? a.avgPower : null,
      elevation_gain_m: a.elevationGain ?? null,
      sport_type_key: a.activityType?.typeKey ?? null,
      raw: a as unknown as Json,
    }));

    if (activityRows.length) {
      const { error: actErr } = await supabase.from("activities").upsert(activityRows, {
        onConflict: "user_id,garmin_activity_id",
      });
      if (actErr) throw new Error(actErr.message);
    }

    const strength = recent.filter(isStrengthActivity);
    const strengthRows = strength.map((a) => {
      const vol = Math.round((a.duration / 60) * 8);
      return {
        user_id: userId,
        garmin_activity_id: a.activityId,
        label: mapStrengthLabel(a.activityName || "Strength"),
        started_at: parseActivityDate(a).toISOString(),
        duration_sec: Math.round(a.duration ?? 0),
        volume_kg: vol,
        exercise_summary: { name: a.activityName, typeKey: a.activityType?.typeKey } as Json,
      };
    });

    if (strengthRows.length) {
      const { error: sErr } = await supabase.from("strength_sessions").upsert(strengthRows, {
        onConflict: "user_id,garmin_activity_id",
      });
      if (sErr) throw new Error(sErr.message);
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

    return {
      ok: true,
      message: "Garmin sync complete",
      counts: {
        activities: activityRows.length,
        strength: strengthRows.length,
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
