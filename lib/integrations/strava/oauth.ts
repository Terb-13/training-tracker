import { decryptJson, encryptJson } from "@/lib/crypto/token-vault";

export type StravaTokenBundle = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export function parseStravaTokens(encrypted: string | null): StravaTokenBundle | null {
  if (!encrypted?.trim()) return null;
  try {
    return decryptJson<StravaTokenBundle>(encrypted);
  } catch {
    return null;
  }
}

export async function refreshStravaTokens(refreshToken: string): Promise<StravaTokenBundle> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${t}`);
  }
  const j = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at,
  };
}

/** Returns fresh tokens and encrypted blob for DB if rotation occurred. */
export async function ensureValidStravaAccess(
  encrypted: string | null,
): Promise<{ accessToken: string; encryptedOut: string | null }> {
  const bundle = parseStravaTokens(encrypted);
  if (!bundle) {
    throw new Error("Connect Strava in Settings (OAuth)");
  }
  const skewSec = 120;
  const now = Math.floor(Date.now() / 1000);
  if (bundle.expires_at > now + skewSec) {
    return { accessToken: bundle.access_token, encryptedOut: null };
  }
  const next = await refreshStravaTokens(bundle.refresh_token);
  return {
    accessToken: next.access_token,
    encryptedOut: encryptJson(next),
  };
}
