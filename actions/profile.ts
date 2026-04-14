"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const DEFAULT_PROFILE = {
  height_cm: 170,
  age: 33,
  target_calories: 3000,
  starting_weight_lbs: 204.2,
  wednesday_lunch_relax: true,
} as const;

export async function ensureProfile() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, error: "Not authenticated" };
  }

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    return { ok: false as const, error: selectError.message };
  }

  if (existing) {
    return { ok: true as const, created: false };
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    ...DEFAULT_PROFILE,
  });

  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }

  return { ok: true as const, created: true };
}
