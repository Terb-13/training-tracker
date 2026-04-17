import { format, subDays, subWeeks } from "date-fns";

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

/** One resolved set row for UI (reps/weights from typed columns or FIT raw). */
export type StrengthSetDetail = {
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight_lbs: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
  volume_lbs: number | null;
};

export type StrengthExerciseGroupVm = {
  exercise_name: string;
  setCount: number;
  avgWeightLbs: number | null;
  totalVolumeLbs: number | null;
  sets: StrengthSetDetail[];
};

export type StrengthSessionDetailVm = {
  garmin_activity_id: number;
  workout_name: string;
  activity_name: string | null;
  dateLabel: string;
  started_at: string;
  totalVolumeLbs: number;
  exercises: StrengthExerciseGroupVm[];
};

export type StrengthProgressionSeries = {
  exerciseName: string;
  dataKey: string;
  points: { dateLabel: string; startedAt: string; avgWeightLbs: number }[];
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
  strengthSessions: StrengthSessionDetailVm[];
  strengthVolumeBySession: { dateLabel: string; workout: string; volumeLbs: number }[];
  /** Merged rows for Recharts (dateLabel + one numeric column per series dataKey). */
  strengthProgressionChart: Record<string, string | number>[];
  strengthProgressionSeries: StrengthProgressionSeries[];
  strengthWeekly: {
    sessionsDone: number;
    sessionsTarget: number;
    weekLabel: string;
  };
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
  fit_sub_sport?: string | null;
  fit_sport?: string | null;
  raw_data?: unknown;
  raw?: unknown;
}): boolean {
  const fit = `${a.fit_sport ?? ""} ${a.fit_sub_sport ?? ""}`.toLowerCase();
  if (fit.includes("cycling") || fit.includes("indoorcycling")) return true;
  const blob = (a.raw_data ?? a.raw) as Record<string, unknown> | null | undefined;
  const derived =
    blob && typeof blob === "object" && blob.derived && typeof blob.derived === "object"
      ? (blob.derived as Record<string, unknown>)
      : null;
  if (derived) {
    const dfit = `${derived.fit_sport ?? ""} ${derived.fit_sub_sport ?? ""}`.toLowerCase();
    if (dfit.includes("cycling") || dfit.includes("indoorcycling")) return true;
  }
  const s = `${a.sport_type_key ?? ""} ${a.activity_type ?? ""} ${a.activity_name ?? ""}`.toLowerCase();
  return s.includes("cycling") || s.includes("bike") || s.includes("peloton");
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Prefer typed columns; fall back to raw_data then raw JSONB (Garmin sync stores full sets here). */
function exerciseJsonBlob(r: StrengthExerciseRow): Record<string, unknown> | null {
  const rd = r.raw_data;
  if (rd && typeof rd === "object" && !Array.isArray(rd)) return rd as Record<string, unknown>;
  if (r.raw && typeof r.raw === "object" && !Array.isArray(r.raw)) return r.raw as Record<string, unknown>;
  return null;
}

function resolveStrengthSetRow(r: StrengthExerciseRow): StrengthSetDetail {
  const ex = strengthRowExtras(r);
  const blob = exerciseJsonBlob(r);
  const reps =
    r.reps != null ? Number(r.reps) : numOrNull(blob?.reps ?? blob?.repetitions);
  const weightLbsTyped =
    r.weight_lbs != null ? Number(r.weight_lbs) : numOrNull(blob?.weight_lbs ?? blob?.weightLbs);
  const lbEquiv =
    weightLbsTyped != null
      ? weightLbsTyped
      : ex.weight_kg != null
        ? ex.weight_kg / 0.453592
        : null;
  const volLb =
    reps != null && lbEquiv != null ? Math.round(reps * lbEquiv * 10) / 10 : null;
  return {
    exercise_name: r.exercise_name,
    set_number: r.set_number,
    reps,
    weight_lbs: weightLbsTyped,
    weight_kg: ex.weight_kg,
    rest_seconds: ex.rest_seconds,
    notes: ex.notes,
    volume_lbs: volLb,
  };
}

function groupStrengthSets(rows: StrengthSetDetail[]): StrengthExerciseGroupVm[] {
  const m = new Map<string, StrengthSetDetail[]>();
  for (const row of rows) {
    const key = row.exercise_name.trim() || "Exercise";
    const list = m.get(key) ?? [];
    list.push(row);
    m.set(key, list);
  }
  return [...m.entries()].map(([exercise_name, sets]) => {
    const sorted = [...sets].sort((a, b) => a.set_number - b.set_number);
    const vol = sorted.reduce((s, x) => s + (x.volume_lbs ?? 0), 0);
    const weights = sorted.map((x) => x.weight_lbs).filter((n): n is number => n != null && n > 0);
    const avgW = weights.length
      ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10
      : null;
    return {
      exercise_name,
      setCount: sorted.length,
      avgWeightLbs: avgW,
      totalVolumeLbs: vol > 0 ? Math.round(vol * 10) / 10 : null,
      sets: sorted,
    };
  });
}

function exerciseDataKey(name: string, i: number): string {
  const slug = name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "ex";
  return `w_${i}_${slug.slice(0, 24)}`;
}

function strengthRowExtras(r: StrengthExerciseRow): {
  weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
} {
  const raw = exerciseJsonBlob(r);
  const wk = raw?.weight_kg;
  const rs = raw?.rest_seconds;
  const n = raw?.notes;
  return {
    weight_kg:
      r.weight_kg != null
        ? Number(r.weight_kg)
        : numOrNull(wk),
    rest_seconds:
      r.rest_seconds != null
        ? Number(r.rest_seconds)
        : numOrNull(rs),
    notes:
      r.notes != null && String(r.notes).trim() !== ""
        ? String(r.notes)
        : typeof n === "string"
          ? n
          : null,
  };
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

  const progressionSince = subDays(new Date(), 90);
  const { data: sessionsProg } = await supabase
    .from("strength_sessions")
    .select("garmin_activity_id, started_at, label")
    .eq("user_id", userId)
    .gte("started_at", progressionSince.toISOString())
    .order("started_at", { ascending: true });

  const progIds = sessionsProg?.map((s) => s.garmin_activity_id) ?? [];
  let progExerciseRows: StrengthExerciseRow[] = [];
  if (progIds.length > 0) {
    const { data: pr } = await supabase
      .from("strength_exercises")
      .select("*")
      .eq("user_id", userId)
      .in("garmin_activity_id", progIds)
      .order("sort_index", { ascending: true });
    progExerciseRows = pr ?? [];
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

  const strengthSessions: StrengthSessionDetailVm[] =
    strengthSessionDetail?.map((s) => {
      const rows = byAct.get(s.garmin_activity_id) ?? [];
      const resolved = rows.map(resolveStrengthSetRow);
      const exercises = groupStrengthSets(resolved);
      const sessionVol = exercises.reduce((acc, e) => acc + (e.totalVolumeLbs ?? 0), 0);
      const totalVol =
        sessionVol > 0
          ? sessionVol
          : resolved.reduce((acc, r) => acc + (r.volume_lbs ?? 0), 0);
      return {
        garmin_activity_id: s.garmin_activity_id,
        workout_name: s.label,
        activity_name: rows[0]?.activity_name ?? null,
        dateLabel: format(new Date(s.started_at), "MMM d"),
        started_at: s.started_at,
        totalVolumeLbs: totalVol > 0 ? Math.round(totalVol * 10) / 10 : 0,
        exercises,
      };
    }) ?? [];

  const byActProg = new Map<number, StrengthExerciseRow[]>();
  for (const r of progExerciseRows) {
    const list = byActProg.get(r.garmin_activity_id) ?? [];
    list.push(r);
    byActProg.set(r.garmin_activity_id, list);
  }

  const volByExercise = new Map<string, number>();
  for (const r of progExerciseRows) {
    const det = resolveStrengthSetRow(r);
    const k = det.exercise_name.trim() || "Exercise";
    volByExercise.set(k, (volByExercise.get(k) ?? 0) + (det.volume_lbs ?? 0));
  }
  const topExerciseNames = [...volByExercise.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map((e) => e[0]);

  const strengthProgressionSeries: StrengthProgressionSeries[] = topExerciseNames.map((exerciseName, i) => {
    const dataKey = exerciseDataKey(exerciseName, i);
    const points: { dateLabel: string; startedAt: string; avgWeightLbs: number }[] = [];
    for (const s of sessionsProg ?? []) {
      const rows = byActProg.get(s.garmin_activity_id) ?? [];
      const same = rows.filter((r) => (r.exercise_name.trim() || "Exercise") === exerciseName);
      if (same.length === 0) continue;
      const sets = same.map(resolveStrengthSetRow);
      let sumW = 0;
      let sumR = 0;
      let wCount = 0;
      let wSum = 0;
      for (const st of sets) {
        if (st.weight_lbs != null && st.weight_lbs > 0) {
          wSum += st.weight_lbs;
          wCount += 1;
        }
        if (st.reps != null && st.weight_lbs != null && st.weight_lbs > 0) {
          sumW += st.weight_lbs * st.reps;
          sumR += st.reps;
        }
      }
      let avg = 0;
      if (sumR > 0) avg = Math.round((sumW / sumR) * 10) / 10;
      else if (wCount > 0) avg = Math.round((wSum / wCount) * 10) / 10;
      else continue;
      points.push({
        dateLabel: format(new Date(s.started_at), "MMM d"),
        startedAt: s.started_at,
        avgWeightLbs: avg,
      });
    }
    return { exerciseName, dataKey, points };
  });

  const allStarts = new Set<string>();
  for (const s of strengthProgressionSeries) {
    for (const p of s.points) allStarts.add(p.startedAt);
  }
  const sortedStarts = [...allStarts].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const strengthProgressionChart: Record<string, string | number>[] =
    sortedStarts.length > 0
      ? sortedStarts.map((startedAt) => {
          const row: Record<string, string | number> = {
            dateLabel: format(new Date(startedAt), "MMM d"),
            startedAt,
          };
          for (const s of strengthProgressionSeries) {
            const pt = s.points.find((p) => p.startedAt === startedAt);
            if (pt) row[s.dataKey] = pt.avgWeightLbs;
          }
          return row;
        })
      : [];

  const weekStart = subDays(new Date(), 7);
  const sessionsLast7 =
    strengthRows?.filter((s) => new Date(s.started_at) >= weekStart).length ?? 0;
  const strengthWeekly = {
    sessionsDone: sessionsLast7,
    sessionsTarget: 3,
    weekLabel: `${format(weekStart, "MMM d")} – ${format(new Date(), "MMM d")}`,
  };

  const strengthVolumeBySession = strengthSessions
    .map((s) => ({
      dateLabel: s.dateLabel,
      workout: s.workout_name,
      volumeLbs: s.totalVolumeLbs,
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
    strengthProgressionChart,
    strengthProgressionSeries,
    strengthWeekly,
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
