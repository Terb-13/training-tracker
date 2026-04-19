import { subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureValidStravaAccess } from "@/lib/integrations/strava/oauth";
import {
  activeCaloriesFromStrava,
  isStravaCyclingType,
  mapStravaActivityToRow,
  type StravaSummaryActivity,
} from "@/lib/integrations/strava/activity-map";
import { bmrMaleKg } from "@/lib/metabolism/bmr";
import { jsonSafe } from "@/lib/sync/json-safe";
import {
  replaceActivitiesTolerant,
  replaceDailyDeficitTolerant,
  updateProfileStravaTolerant,
} from "@/lib/sync/supabase-tolerant";
import type { Database, Json } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const STRAVA_ACTIVITIES = "https://www.strava.com/api/v3/athlete/activities";

function parseActivityDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function runStravaSync(
  userId: string,
  supabase: SupabaseClient,
  profileRow: Profile,
): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  counts?: {
    activities: number;
    daily_deficit: number;
  };
}> {
  try {
    const { accessToken, encryptedOut } = await ensureValidStravaAccess(
      profileRow.strava_tokens_encrypted,
    );

    const now = new Date();
    const afterSec = Math.floor(subDays(now, 14).getTime() / 1000);
    const rows: StravaSummaryActivity[] = [];
    let page = 1;
    const perPage = 100;

    for (;;) {
      const url = new URL(STRAVA_ACTIVITIES);
      url.searchParams.set("after", String(afterSec));
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(perPage));
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Strava activities ${res.status}: ${t}`);
      }
      const batch = (await res.json()) as StravaSummaryActivity[];
      if (!batch.length) break;
      rows.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
      if (page > 20) break;
    }

    const cycling = rows.filter((a) => isStravaCyclingType(a.type));
    const activityRows = cycling.map((a) => mapStravaActivityToRow(userId, a));

    if (activityRows.length) {
      await replaceActivitiesTolerant(supabase, activityRows);
    }

    const { data: profileFresh } = await supabase.from("profiles").select("*").eq("id", userId).single();

    const maxWeightLb = Number(profileFresh?.starting_weight_lbs ?? 204.2);
    const weightKg = maxWeightLb * 0.453592;
    const heightCm = profileFresh?.height_cm ?? 170;
    const age = profileFresh?.age ?? 33;
    const resting = Math.round(bmrMaleKg(weightKg, heightCm, age) * 1.25);
    const target = profileFresh?.target_calories ?? 3000;

    const byDay = new Map<string, number>();
    for (const a of cycling) {
      const day = parseActivityDate(a.start_date).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + activeCaloriesFromStrava(a));
    }

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
        raw_data: jsonSafe({
          deficit_kcal: deficit,
          target_calories: target,
          active_calories: active,
          resting_calories_est: resting,
          calories_in: null,
          projected_weekly_loss_lbs: projLoss,
          source: "strava_sync",
        }) as Json,
      });
    }

    const deficitInserted = await replaceDailyDeficitTolerant(
      supabase,
      deficitRows.map((r) => ({ ...r }) as Record<string, unknown>),
    );

    const tokenPatch: Record<string, unknown> = {
      strava_last_sync_at: new Date().toISOString(),
    };
    if (encryptedOut) {
      tokenPatch.strava_tokens_encrypted = encryptedOut;
    }

    await updateProfileStravaTolerant(supabase, userId, tokenPatch);

    console.log(
      `[Strava sync] OK — ${activityRows.length} cycling activities, ${deficitInserted} daily_deficit rows`,
    );

    return {
      ok: true,
      message: "Strava sync complete",
      counts: {
        activities: activityRows.length,
        daily_deficit: deficitInserted,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return { ok: false, error: msg };
  }
}
