import { format, subWeeks } from "date-fns";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  START_WEIGHT_LBS,
  TARGET_WEEKLY_LOSS_MAX,
  TARGET_WEEKLY_LOSS_MIN,
  cyclingWeek as placeholderCycling,
  garminAutoRhythm,
  garminStrengthSessions as placeholderStrength,
  lotojaReadiness as placeholderReadiness,
  nutritionPlaceholder,
  projectedFatLossSeries as placeholderProjected,
  weeklyRhythmScores as placeholderRhythm,
  weightSeries as placeholderWeight,
} from "@/lib/placeholder-data";

type StrengthExerciseRow = Database["public"]["Tables"]["strength_exercises"]["Row"];

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type GarminWellness = {
  sleepHours: number;
  hrvMs: number;
  restingHr: number;
  recoveryScore: number;
};

export type DashboardViewModel = {
  hasRealData: boolean;
  profile: ProfileRow | null;
  weightSeries: { date: string; weight: number }[];
  projectedFatLossSeries: {
    date: string;
    weight: number;
    trendLow: number;
    trendHigh: number;
  }[];
  weeklyLossLb: number | null;
  corridorMin: number;
  corridorMax: number;
  cycling: {
    volumeHours: number;
    zone2Hours: number;
    longestRideMiles: number;
    wkgTrend: { week: string; wkg: number }[];
  };
  strength: {
    label: string;
    last: string;
    durationMin: number;
    volumeKg: number | null;
    loadHint: string;
  }[];
  strengthSessions: {
    garmin_activity_id: number;
    workout_name: string;
    activity_name: string | null;
    dateLabel: string;
    started_at: string;
    rows: {
      exercise_name: string;
      set_number: number;
      reps: number | null;
      weight_lbs: number | null;
      volume_lbs: number | null;
    }[];
  }[];
  strengthVolumeBySession: { dateLabel: string; workout: string; volumeLbs: number }[];
  garmin: GarminWellness;
  nutrition: {
    caloriesAvg: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    deficitVsTarget: number;
    wednesdayBonusKcal: number;
  };
  weeklyRhythmScores: { week: string; score: number }[];
  lotojaReadiness: number;
  lastSyncAt: string | null;
  deficitBarChart: { day: string; kcal: number }[];
};

function isCyclingDb(a: {
  sport_type_key: string | null;
  activity_type: string | null;
  activity_name: string | null;
}): boolean {
  const s = `${a.sport_type_key ?? ""} ${a.activity_type ?? ""} ${a.activity_name ?? ""}`.toLowerCase();
  return s.includes("cycling") || s.includes("bike") || s.includes("peloton");
}

function parseWellness(raw: ProfileRow["garmin_wellness"]): GarminWellness {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      sleepHours: typeof o.sleepHours === "number" ? o.sleepHours : garminAutoRhythm.sleepH,
      hrvMs: typeof o.hrvMs === "number" ? o.hrvMs : garminAutoRhythm.hrvMs,
      restingHr: typeof o.restingHr === "number" ? o.restingHr : garminAutoRhythm.restingHr,
      recoveryScore: typeof o.recoveryScore === "number" ? o.recoveryScore : garminAutoRhythm.recoveryScore,
    };
  }
  return {
    sleepHours: garminAutoRhythm.sleepH,
    hrvMs: garminAutoRhythm.hrvMs,
    restingHr: garminAutoRhythm.restingHr,
    recoveryScore: garminAutoRhythm.recoveryScore,
  };
}

export async function loadDashboardData(userId: string): Promise<DashboardViewModel> {
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  const since = new Date();
  since.setDate(since.getDate() - 8);

  const { data: weights } = await supabase
    .from("body_composition")
    .select("*")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .gte("start_time_gmt", since.toISOString());

  const { data: strengthRows } = await supabase
    .from("strength_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(12);

  const { data: strengthSessionDetail } = await supabase
    .from("strength_sessions")
    .select("garmin_activity_id, label, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(24);

  const detailIds = strengthSessionDetail?.map((s) => s.garmin_activity_id) ?? [];
  let exerciseRows: StrengthExerciseRow[] = [];
  if (detailIds.length > 0) {
    const { data: ex } = await supabase
      .from("strength_exercises")
      .select("*")
      .eq("user_id", userId)
      .in("garmin_activity_id", detailIds)
      .order("sort_index", { ascending: true });
    exerciseRows = ex ?? [];
  }

  const { data: deficits } = await supabase
    .from("daily_deficit")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(14);

  const { data: projRpc } = await supabase.rpc("calculate_projected_loss", { p_user_id: userId });

  const hasWeights = weights && weights.length >= 2;
  const hasActivities = activities && activities.length > 0;
  const hasRealData = Boolean(hasWeights || hasActivities);

  const startWeight = Number(profile?.starting_weight_lbs ?? START_WEIGHT_LBS);

  let weightSeries =
    weights?.map((w) => ({
      date: format(new Date(w.date + "T12:00:00"), "MMM d"),
      weight: Number(w.weight_lbs),
    })) ?? [];

  let projectedFatLossSeries = weightSeries.map((row, i) => ({
    ...row,
    trendLow: startWeight - TARGET_WEEKLY_LOSS_MAX * ((i + 1) / 7),
    trendHigh: startWeight - TARGET_WEEKLY_LOSS_MIN * ((i + 1) / 7),
  }));

  if (weightSeries.length < 2) {
    weightSeries = [...placeholderWeight];
    projectedFatLossSeries = [...placeholderProjected];
  }

  const weeklyLossLb =
    typeof projRpc === "number" && !Number.isNaN(projRpc)
      ? projRpc
      : weightSeries.length >= 2
        ? ((weightSeries[0].weight - weightSeries[weightSeries.length - 1].weight) /
            Math.max(1, weightSeries.length - 1)) *
          7
        : null;

  const cyclingActs = (activities ?? []).filter(isCyclingDb);
  const totalSec = cyclingActs.reduce((s, a) => s + (a.duration_sec ?? 0), 0);
  const volumeHours = Math.round((totalSec / 3600) * 10) / 10;
  const zone2Hours = Math.round((totalSec * 0.55) / 3600 * 10) / 10;
  const longestM =
    cyclingActs.length > 0
      ? Math.max(...cyclingActs.map((a) => (a.distance_m ?? 0) / 1609.34))
      : 0;
  const longestRideMiles = Math.round(longestM * 10) / 10;

  const weightKg = (weightSeries.at(-1)?.weight ?? startWeight) * 0.453592;
  const wkgPoints: { week: string; wkg: number }[] = [];
  for (let w = 3; w >= 0; w--) {
    const end = subWeeks(new Date(), w);
    const start = subWeeks(end, 1);
    const label = format(end, "MMM d");
    const weekActs = cyclingActs.filter((a) => {
      const t = new Date(a.start_time_gmt).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    const powers = weekActs
      .map((a) => (typeof a.avg_power === "number" ? a.avg_power : null))
      .filter((x): x is number => x != null && x > 0);
    const avgP = powers.length ? powers.reduce((a, b) => a + b, 0) / powers.length : null;
    const wkg =
      avgP && weightKg > 0
        ? Math.round((avgP / weightKg) * 100) / 100
        : placeholderCycling.wkgTrend[3 - w]?.wkg ?? 2.9;
    wkgPoints.push({ week: label, wkg });
  }

  const showCycling = hasRealData && cyclingActs.length > 0;

  const strength =
    strengthRows?.map((s) => ({
      label: s.label,
      last: format(new Date(s.started_at), "MMM d"),
      durationMin: Math.round(s.duration_sec / 60),
      volumeKg: s.volume_kg,
      loadHint: `Garmin · ${s.volume_kg ? `${Math.round(s.volume_kg)} kg est` : "volume est."}`,
    })) ?? [];

  const strengthOut =
    strength.length > 0
      ? strength
      : placeholderStrength.map((s) => ({
          label: s.label,
          last: s.last,
          durationMin: s.durationMin,
          volumeKg: null,
          loadHint: s.loadHint,
        }));

  const byAct = new Map<number, StrengthExerciseRow[]>();
  for (const row of exerciseRows) {
    const list = byAct.get(row.garmin_activity_id) ?? [];
    list.push(row);
    byAct.set(row.garmin_activity_id, list);
  }

  const strengthSessions =
    strengthSessionDetail?.map((s) => {
      const rows = byAct.get(s.garmin_activity_id) ?? [];
      return {
        garmin_activity_id: s.garmin_activity_id,
        workout_name: s.label,
        activity_name: rows[0]?.activity_name ?? null,
        dateLabel: format(new Date(s.started_at), "MMM d"),
        started_at: s.started_at,
        rows: rows.map((r) => ({
          exercise_name: r.exercise_name,
          set_number: r.set_number,
          reps: r.reps,
          weight_lbs: r.weight_lbs,
          volume_lbs:
            r.reps != null && r.weight_lbs != null
              ? Math.round(r.reps * Number(r.weight_lbs) * 10) / 10
              : null,
        })),
      };
    }) ?? [];

  const strengthVolumeBySession = strengthSessions
    .map((s) => ({
      dateLabel: s.dateLabel,
      workout: s.workout_name,
      volumeLbs: s.rows.reduce((acc, r) => acc + (r.volume_lbs ?? 0), 0),
    }))
    .slice(0, 12)
    .reverse();

  const garmin =
    hasRealData && profile?.garmin_last_sync_at
      ? parseWellness(profile.garmin_wellness)
      : {
          sleepHours: garminAutoRhythm.sleepH,
          hrvMs: garminAutoRhythm.hrvMs,
          restingHr: garminAutoRhythm.restingHr,
          recoveryScore: garminAutoRhythm.recoveryScore,
        };

  const latestDef = deficits?.[0];
  const deficitVal =
    typeof latestDef?.deficit_kcal === "number"
      ? Math.abs(latestDef.deficit_kcal)
      : nutritionPlaceholder.deficitVsTarget;
  const wednesdayBonus = profile?.wednesday_lunch_relax ? 320 : 0;

  const weeklyRhythmScores =
    deficits && deficits.length >= 4
      ? deficits.slice(0, 4).map((d, i) => ({
          week: format(subWeeks(new Date(), i), "MMM d"),
          score: Math.min(100, 68 + Math.round((d.active_calories ?? 0) / 85)),
        }))
      : placeholderRhythm;

  const inCorridor =
    weeklyLossLb != null && weeklyLossLb >= 0.45 && weeklyLossLb <= 1.05;
  const lotojaReadiness =
    hasRealData && weeklyLossLb != null
      ? Math.min(
          100,
          Math.round(58 + (inCorridor ? 12 : 0) + Math.min(20, (showCycling ? volumeHours : 0) * 2.5)),
        )
      : placeholderReadiness;

  const sortedDef = [...(deficits ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const deficitBarChart =
    sortedDef.length > 0
      ? sortedDef.map((d) => ({
          day: format(new Date(d.date + "T12:00:00"), "EEE").slice(0, 1),
          kcal: Math.max(0, Math.min(500, Math.abs(d.deficit_kcal ?? 0))),
        }))
      : [
          { day: "M", kcal: 260 },
          { day: "T", kcal: 240 },
          { day: "W", kcal: 180 },
          { day: "T", kcal: 250 },
          { day: "F", kcal: 265 },
          { day: "S", kcal: 230 },
          { day: "S", kcal: 245 },
        ];

  return {
    hasRealData,
    profile: profile ?? null,
    weightSeries,
    projectedFatLossSeries,
    weeklyLossLb,
    corridorMin: TARGET_WEEKLY_LOSS_MIN,
    corridorMax: TARGET_WEEKLY_LOSS_MAX,
    cycling: {
      volumeHours: showCycling ? volumeHours : !hasRealData ? placeholderCycling.volumeHours : 0,
      zone2Hours: showCycling ? zone2Hours : !hasRealData ? placeholderCycling.zone2Hours : 0,
      longestRideMiles: showCycling ? longestRideMiles : !hasRealData ? placeholderCycling.longestRideMiles : 0,
      wkgTrend: showCycling ? wkgPoints : placeholderCycling.wkgTrend,
    },
    strength: strengthOut,
    strengthSessions,
    strengthVolumeBySession,
    garmin,
    nutrition: {
      caloriesAvg: nutritionPlaceholder.caloriesAvg,
      proteinG: nutritionPlaceholder.proteinG,
      carbsG: nutritionPlaceholder.carbsG,
      fatG: nutritionPlaceholder.fatG,
      deficitVsTarget: deficitVal,
      wednesdayBonusKcal: wednesdayBonus,
    },
    weeklyRhythmScores,
    lotojaReadiness,
    lastSyncAt: profile?.garmin_last_sync_at ?? null,
    deficitBarChart,
  };
}
