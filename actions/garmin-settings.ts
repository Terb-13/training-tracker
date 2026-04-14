"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { encryptJson } from "@/lib/crypto/credentials";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/** Form actions must return void in Next.js 16 — use redirect for feedback. */
export async function saveGarminCredentials(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const email = (formData.get("garmin_email") as string | null)?.trim() ?? "";
  const password = (formData.get("garmin_password") as string | null) ?? "";

  const update: ProfileUpdate = {
    garmin_email: email || null,
  };

  if (password.length > 0) {
    update.garmin_password_encrypted = encryptJson({ password });
    update.garmin_tokens_encrypted = null;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    redirect(`/dashboard/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
