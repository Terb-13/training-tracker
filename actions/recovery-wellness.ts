"use server";

import { redirect } from "next/navigation";

import type { Json } from "@/types/database";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveRecoveryWellness(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const sleep = Number(formData.get("sleep_hours"));
  const hrv = Number(formData.get("hrv_ms"));
  const rhr = Number(formData.get("resting_hr"));
  const recovery = Number(formData.get("recovery_score"));

  const payload: Json = {
    sleepHours: Number.isFinite(sleep) ? sleep : 6.7,
    hrvMs: Number.isFinite(hrv) ? hrv : 52,
    restingHr: Number.isFinite(rhr) ? rhr : 54,
    recoveryScore: Number.isFinite(recovery) ? recovery : 82,
  };

  await supabase.from("profiles").update({ recovery_wellness: payload }).eq("id", user.id);
  redirect("/dashboard/settings?recovery=1");
}
