import Link from "next/link";

import { disconnectStrava } from "@/actions/strava";
import { logBodyWeight } from "@/actions/log-weight";
import { saveRecoveryWellness } from "@/actions/recovery-wellness";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function numFromWellness(raw: unknown, key: string, fallback: number): number {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return fallback;
}

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const q = await searchParams;

  const stravaErr = typeof q.strava_error === "string" ? decodeURIComponent(q.strava_error) : null;
  const stravaOk = q.strava === "connected";
  const stravaDc = q.strava === "disconnected";
  const weightOk = q.weight === "1";
  const weightErr = typeof q.weight_err === "string" ? q.weight_err : null;
  const recoveryOk = q.recovery === "1";

  const rw = profile?.recovery_wellness;
  const sleepD = numFromWellness(rw, "sleepHours", 6.7);
  const hrvD = numFromWellness(rw, "hrvMs", 52);
  const rhrD = numFromWellness(rw, "restingHr", 54);
  const recD = numFromWellness(rw, "recoveryScore", 82);

  const connected = Boolean(profile?.strava_tokens_encrypted);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/dashboard" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Strava OAuth, optional recovery numbers for the Rhythm tab, and manual weight for fat-loss charts.
          Tokens are encrypted with <code className="text-xs">INTEGRATION_ENCRYPTION_KEY</code> on the server.
        </p>
        {stravaOk ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Strava connected. Use &ldquo;Sync Strava now&rdquo; on the dashboard.
          </p>
        ) : null}
        {stravaDc ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">Strava disconnected.</p>
        ) : null}
        {stravaErr ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{stravaErr}</p>
        ) : null}
        {weightOk ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">Weight saved.</p>
        ) : null}
        {weightErr ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            {weightErr === "invalid" ? "Enter a realistic weight (lb)." : decodeURIComponent(weightErr)}
          </p>
        ) : null}
        {recoveryOk ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Recovery signals saved.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strava</CardTitle>
          <CardDescription>
            Authorize once. We sync the last ~14 days of cycling activities (Ride, Virtual, e-bike, MTB,
            gravel) for volume, power estimates, calories, and the fat-loss engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Status:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {connected ? "Connected" : "Not connected"}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="w-full sm:w-auto">
              <a href="/api/strava/connect">Connect Strava</a>
            </Button>
            {connected ? (
              <form action={disconnectStrava}>
                <Button type="submit" variant="outline">
                  Disconnect
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery signals</CardTitle>
          <CardDescription>Used on the Daily Rhythm tab (sleep, HRV, RHR, recovery score).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveRecoveryWellness} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sleep_hours">Sleep (h)</Label>
              <Input
                id="sleep_hours"
                name="sleep_hours"
                type="number"
                step="0.1"
                defaultValue={sleepD}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hrv_ms">HRV (ms)</Label>
              <Input id="hrv_ms" name="hrv_ms" type="number" step="1" defaultValue={hrvD} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resting_hr">Resting HR (bpm)</Label>
              <Input id="resting_hr" name="resting_hr" type="number" defaultValue={rhrD} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery_score">Recovery score</Label>
              <Input id="recovery_score" name="recovery_score" type="number" defaultValue={recD} required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full sm:w-auto">
                Save recovery signals
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log weight</CardTitle>
          <CardDescription>Manual entry for the weight trend chart (body composition table).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logBodyWeight} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weight_date">Date</Label>
              <Input
                id="weight_date"
                name="weight_date"
                type="date"
                required
                defaultValue={todayIsoDate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight_lbs">Weight (lb)</Label>
              <Input id="weight_lbs" name="weight_lbs" type="number" step="0.1" placeholder="e.g. 202.4" required />
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              Save weight
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
