import Link from "next/link";

import { saveGarminCredentials } from "@/actions/garmin-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
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
  const saveError = q.error ? decodeURIComponent(q.error) : null;
  const saved = q.saved === "1";

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/dashboard" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Garmin settings</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Credentials are encrypted at rest with <code className="text-xs">GARMIN_ENCRYPTION_KEY</code>{" "}
          on the server. After saving, use &ldquo;Sync Garmin now&rdquo; on the dashboard.
        </p>
        {saved ? (
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">Saved.</p>
        ) : null}
        {saveError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connect Garmin Connect</CardTitle>
          <CardDescription>
            Same login as the Garmin Connect app. Tokens are stored after first successful sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveGarminCredentials} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="garmin_email">Garmin email</Label>
              <Input
                id="garmin_email"
                name="garmin_email"
                type="email"
                autoComplete="username"
                defaultValue={profile?.garmin_email ?? ""}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="garmin_password">Garmin password</Label>
              <Input
                id="garmin_password"
                name="garmin_password"
                type="password"
                autoComplete="current-password"
                placeholder="Leave blank to keep existing"
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                Leave password empty to keep the stored password. Saving a new password clears OAuth
                tokens and forces a fresh login on next sync.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Save credentials
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
