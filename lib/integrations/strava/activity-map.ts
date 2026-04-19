import type { Json } from "@/types/database";

import { jsonSafe } from "@/lib/sync/json-safe";

/** Strava summary activity (subset of API v3). */
export type StravaSummaryActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  start_date: string;
  calories?: number;
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  weighted_average_watts?: number;
  device_watts?: boolean;
  suffer_score?: number;
};

const CYCLING_TYPES = new Set([
  "Ride",
  "VirtualRide",
  "EBikeRide",
  "MountainBikeRide",
  "GravelRide",
]);

export function isStravaCyclingType(type: string): boolean {
  return CYCLING_TYPES.has(type);
}

function caloriesFromActivity(a: StravaSummaryActivity): number | null {
  if (typeof a.calories === "number" && a.calories > 0) return Math.round(a.calories);
  if (typeof a.kilojoules === "number" && a.kilojoules > 0) {
    return Math.round(a.kilojoules * 0.239006);
  }
  return null;
}

/** Calories burned for deficit rollup (summary activity). */
export function activeCaloriesFromStrava(a: StravaSummaryActivity): number {
  return caloriesFromActivity(a) ?? 0;
}

function mapActivityType(a: StravaSummaryActivity): string {
  const name = (a.name || "").toLowerCase();
  if (a.type === "VirtualRide" && (name.includes("peloton") || name.includes("indoor"))) {
    return "peloton";
  }
  if (a.type === "VirtualRide") return "virtual_ride";
  if (a.type === "EBikeRide") return "e_bike";
  return "ride";
}

/** Map Strava activity → activities row shape (external_activity_id = Strava id). */
export function mapStravaActivityToRow(
  userId: string,
  a: StravaSummaryActivity,
): Record<string, unknown> {
  const cal = caloriesFromActivity(a);
  const workJ =
    typeof a.kilojoules === "number" && a.kilojoules > 0
      ? Math.round(a.kilojoules * 1000)
      : null;
  const raw: Json = jsonSafe({ strava: a, source: "strava" }) as Json;
  return {
    user_id: userId,
    external_activity_id: a.id,
    activity_type: mapActivityType(a),
    activity_name: a.name ?? "Ride",
    start_time_gmt: a.start_date,
    duration_sec: a.moving_time > 0 ? a.moving_time : a.elapsed_time,
    distance_m: a.distance > 0 ? a.distance : null,
    calories: cal,
    avg_hr:
      typeof a.average_heartrate === "number" ? Math.round(a.average_heartrate) : null,
    max_hr: typeof a.max_heartrate === "number" ? Math.round(a.max_heartrate) : null,
    max_power: null,
    avg_power:
      typeof a.weighted_average_watts === "number"
        ? Math.round(a.weighted_average_watts)
        : null,
    elevation_gain_m:
      typeof a.total_elevation_gain === "number" ? a.total_elevation_gain : null,
    sport_type_key: a.type,
    fit_sport: null,
    fit_sub_sport: null,
    total_work_j: workJ,
    normalized_power: null,
    training_stress_score:
      typeof a.suffer_score === "number" ? a.suffer_score : null,
    total_ascent_m: null,
    total_descent_m: null,
    num_laps: null,
    total_timer_time_sec: a.elapsed_time > 0 ? a.elapsed_time : null,
    raw_data: raw,
  };
}
