import { NextResponse } from "next/server";

import { runGarminSync } from "@/lib/sync/garmin-sync";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = request.headers.get("authorization");

  try {
    if (serviceKey && auth === `Bearer ${serviceKey}`) {
      const body = (await request.json().catch(() => ({}))) as { userId?: string };
      if (!body.userId) {
        return NextResponse.json({ error: "userId required for service-role sync" }, { status: 400 });
      }
      const admin = createServiceRoleClient();
      const { data: profile, error } = await admin.from("profiles").select("*").eq("id", body.userId).single();
      if (error || !profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      const result = await runGarminSync(body.userId, admin, profile);
      return NextResponse.json(result);
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (pErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const result = await runGarminSync(user.id, supabase, profile);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
