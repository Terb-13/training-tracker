"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { encryptJson } from "@/lib/crypto/credentials";
import { DEFAULT_PROFILE } from "@/lib/profile-constants";
import { extractMissingColumnName } from "@/lib/sync/supabase-tolerant";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

const PROFILE_SAVE_SELECT =
  "id, garmin_email, garmin_password_encrypted, garmin_tokens_encrypted, garmin_last_sync_at, updated_at" as const;

type SavedProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "garmin_email"
  | "garmin_password_encrypted"
  | "garmin_tokens_encrypted"
  | "garmin_last_sync_at"
  | "updated_at"
>;

async function upsertProfileByUpdateOrInsert(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  hasExistingRow: boolean,
  row: ProfileInsert,
): Promise<{ data: SavedProfileRow | null; error: string | null }> {
  const insertPayload = { ...row } as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = { ...row };
  delete updatePayload.id;

  if (hasExistingRow) {
    let patch = { ...updatePayload };
    for (let attempt = 0; attempt < 48; attempt++) {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", userId)
        .select(PROFILE_SAVE_SELECT)
        .maybeSingle();
      if (!error && data) return { data, error: null };
      if (!error && !data) break;
      const msg = error?.message ?? "";
      const col = extractMissingColumnName(msg);
      if (!col) return { data: null, error: msg };
      const next = { ...patch };
      delete next[col];
      patch = next;
    }
  }

  let ins = { ...insertPayload };
  for (let attempt = 0; attempt < 48; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .insert(ins as never)
      .select(PROFILE_SAVE_SELECT)
      .maybeSingle();
    if (!error && data) return { data, error: null };
    const msg = error?.message ?? "";
    const col = extractMissingColumnName(msg);
    if (!col) return { data: null, error: msg };
    const next = { ...ins };
    delete next[col];
    ins = next;
  }
  return { data: null, error: "profiles write: exceeded adaptive retries" };
}

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

  const { data: existing, error: loadError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (loadError) {
    console.error("[saveGarminCredentials] load profile", loadError.message);
    redirect(`/dashboard/settings?error=${encodeURIComponent(loadError.message)}`);
  }

  const row: ProfileInsert = {
    id: user.id,
    height_cm: existing?.height_cm ?? DEFAULT_PROFILE.height_cm,
    age: existing?.age ?? DEFAULT_PROFILE.age,
    target_calories: existing?.target_calories ?? DEFAULT_PROFILE.target_calories,
    starting_weight_lbs: existing?.starting_weight_lbs ?? DEFAULT_PROFILE.starting_weight_lbs,
    wednesday_lunch_relax: existing?.wednesday_lunch_relax ?? DEFAULT_PROFILE.wednesday_lunch_relax,
    garmin_email: email || null,
    garmin_password_encrypted:
      password.length > 0
        ? encryptJson({ password })
        : (existing?.garmin_password_encrypted ?? null),
    garmin_tokens_encrypted: password.length > 0 ? null : (existing?.garmin_tokens_encrypted ?? null),
    garmin_last_sync_at: existing?.garmin_last_sync_at ?? null,
    max_hr: existing?.max_hr ?? null,
    garmin_wellness: existing?.garmin_wellness ?? null,
  };

  const { data: saved, error } = await upsertProfileByUpdateOrInsert(supabase, user.id, Boolean(existing), row);

  if (error || !saved) {
    const msg = error ?? "Save failed";
    console.error("[saveGarminCredentials] update/insert", msg);
    redirect(`/dashboard/settings?error=${encodeURIComponent(msg)}`);
  }

  console.log("[saveGarminCredentials] save ok", {
    id: saved?.id,
    garmin_email: saved?.garmin_email,
    has_password_encrypted: Boolean(saved?.garmin_password_encrypted),
    has_tokens_encrypted: Boolean(saved?.garmin_tokens_encrypted),
    updated_at: saved?.updated_at,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
