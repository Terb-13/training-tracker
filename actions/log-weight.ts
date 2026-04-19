"use server";

import { redirect } from "next/navigation";

import { replaceBodyCompositionTolerant } from "@/lib/sync/supabase-tolerant";
import { jsonSafe } from "@/lib/sync/json-safe";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function logBodyWeight(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const dateRaw = (formData.get("weight_date") as string | null)?.trim();
  const wRaw = formData.get("weight_lbs") as string | null;
  const date =
    dateRaw && dateRaw.length >= 10 ? dateRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const weight_lbs = Number.parseFloat(wRaw ?? "");
  if (!Number.isFinite(weight_lbs) || weight_lbs < 80 || weight_lbs > 400) {
    redirect("/dashboard/settings?weight_err=invalid");
  }

  try {
    await replaceBodyCompositionTolerant(supabase, [
      {
        user_id: user.id,
        date,
        weight_lbs,
        body_fat_pct: null,
        muscle_mass_lbs: null,
        source: "manual",
        raw: jsonSafe({ source: "manual", weight_lbs, date }),
      },
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    redirect(`/dashboard/settings?weight_err=${encodeURIComponent(msg)}`);
  }
  redirect("/dashboard/settings?weight=1");
}
