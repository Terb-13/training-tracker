"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function disconnectStrava(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      strava_tokens_encrypted: null,
      strava_last_sync_at: null,
    })
    .eq("id", user.id);

  if (error) {
    redirect(`/dashboard/settings?strava_error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard/settings?strava=disconnected");
}
