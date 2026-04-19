import { NextResponse } from "next/server";

import { encryptJson } from "@/lib/crypto/token-vault";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TOKEN_URL = "https://www.strava.com/oauth/token";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { searchParams } = new URL(request.url);
  const err = searchParams.get("error");
  const code = searchParams.get("code");

  if (err) {
    return NextResponse.redirect(
      `${origin}/dashboard/settings?strava_error=${encodeURIComponent(err)}`,
    );
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/dashboard/settings?strava_error=no_code`);
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/dashboard/settings?strava_error=config`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const redirectUri = `${origin}/api/strava/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const t = await res.text();
    return NextResponse.redirect(
      `${origin}/dashboard/settings?strava_error=${encodeURIComponent(`token_${res.status}:${t.slice(0, 80)}`)}`,
    );
  }

  const j = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const bundle = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
  };

  let encrypted: string;
  try {
    encrypted = encryptJson(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "encrypt";
    return NextResponse.redirect(`${origin}/dashboard/settings?strava_error=${encodeURIComponent(msg)}`);
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      strava_tokens_encrypted: encrypted,
      strava_last_sync_at: null,
    })
    .eq("id", user.id);

  if (upErr) {
    return NextResponse.redirect(
      `${origin}/dashboard/settings?strava_error=${encodeURIComponent(upErr.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/dashboard/settings?strava=connected`);
}
