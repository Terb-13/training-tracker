"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Dumbbell, Moon, Settings, Utensils } from "lucide-react";

import { buildWeeklyGrokPayload } from "@/lib/placeholder-data";
import type { DashboardViewModel } from "@/lib/data/dashboard-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { SyncButton } from "@/components/dashboard/sync-button";

export function TrainingDashboard({
  userEmail,
  data,
}: {
  userEmail: string | null;
  data: DashboardViewModel;
}) {
  const profile = data.profile;
  const [familyLoad, setFamilyLoad] = useState([55]);
  const [workLoad, setWorkLoad] = useState([48]);
  const [grokOpen, setGrokOpen] = useState(false);

  const currentWeight = data.weightSeries[data.weightSeries.length - 1]?.weight ?? 204.2;
  const weeklyLoss = data.weeklyLossLb;

  const todayRhythm = useMemo(() => {
    const base = data.garmin.recoveryScore;
    const adj = (familyLoad[0] + workLoad[0]) / 2;
    return Math.min(100, Math.max(40, Math.round(base - adj * 0.08 + 12)));
  }, [familyLoad, workLoad, data.garmin.recoveryScore]);

  const grokPayload = useMemo(
    () =>
      buildWeeklyGrokPayload({
        profile,
        familyLoad: familyLoad[0],
        workLoad: workLoad[0],
        userEmail,
        weightSeries: data.weightSeries,
        cycling: data.cycling,
        strength: data.strength.map((s) => ({
          label: s.label,
          last: s.last,
          durationMin: s.durationMin,
          loadHint: s.loadHint,
        })),
        garminHealth: {
          sleepH: data.garmin.sleepHours,
          hrvMs: data.garmin.hrvMs,
          restingHr: data.garmin.restingHr,
          recoveryScore: data.garmin.recoveryScore,
        },
        nutrition: {
          caloriesAvg: data.nutrition.caloriesAvg,
          proteinG: data.nutrition.proteinG,
          carbsG: data.nutrition.carbsG,
          fatG: data.nutrition.fatG,
          deficitVsTarget: data.nutrition.deficitVsTarget,
        },
        lotojaReadinessPct: data.lotojaReadiness,
      }),
    [profile, familyLoad, workLoad, userEmail, data],
  );

  const grokJson = useMemo(() => JSON.stringify(grokPayload, null, 2), [grokPayload]);

  const isWednesday = useMemo(() => new Date().getDay() === 3, []);

  const startLb = profile?.starting_weight_lbs ?? 204.2;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const weightMin = Math.min(...data.weightSeries.map((w) => w.weight)) - 0.5;
  const weightMax = Math.max(...data.weightSeries.map((w) => w.weight)) + 0.5;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            LOTOJA 2026 · Team Training OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Morning command center
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted-foreground)]">
            In by 6:45 a.m., Peloton + strength under 90 minutes, showered before the bell. Wednesday
            lunch stays yours.
          </p>
          {data.lastSyncAt ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Last Garmin sync: {new Date(data.lastSyncAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              No Garmin sync yet — add credentials in Settings, then sync.
            </p>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="lg"
              className="w-full bg-amber-500 font-semibold text-slate-950 shadow-md hover:bg-amber-400 sm:w-auto"
              onClick={() => setGrokOpen(true)}
            >
              Get Grok&apos;s Weekly Recommendations
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Garmin settings
              </Link>
            </Button>
            <SyncButton />
            <Button variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="snapshot" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:flex-nowrap">
          <TabsTrigger value="snapshot">Today&apos;s Snapshot</TabsTrigger>
          <TabsTrigger value="cycling">Cycling Base</TabsTrigger>
          <TabsTrigger value="strength">Strength Progress</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition &amp; Fat Loss</TabsTrigger>
          <TabsTrigger value="rhythm">Daily Rhythm Score</TabsTrigger>
        </TabsList>

        <TabsContent value="snapshot" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Current weight"
              value={`${currentWeight.toFixed(1)} lbs`}
              hint={data.hasRealData ? "From Garmin body composition" : "Sample data until sync"}
            />
            <KpiCard
              title="Projected weekly loss"
              value={
                weeklyLoss != null && !Number.isNaN(weeklyLoss)
                  ? `${weeklyLoss.toFixed(2)} lb/wk`
                  : "—"
              }
              hint={`Safe band ${data.corridorMin}–${data.corridorMax} lb/wk · SQL engine`}
            />
            <KpiCard
              title="Today’s Rhythm Score"
              value={`${todayRhythm}`}
              hint="Garmin recovery + family/work load"
            />
            <KpiCard
              title="LOTOJA readiness"
              value={`${data.lotojaReadiness}%`}
              hint="September 200-mile target curve"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <ChartCard
              title="Weight trend (7 days)"
              description={data.hasRealData ? "Live from Garmin" : "Sample — sync for live data"}
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.weightSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[weightMin, weightMax]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Line type="monotone" dataKey="weight" stroke="#2563eb" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Projected fat loss"
              description={`Actual vs ${data.corridorMin}–${data.corridorMax} lb/wk corridor from ${startLb} lb start`}
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.projectedFatLossSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trendHigh"
                    stroke="#93c5fd"
                    strokeDasharray="4 4"
                    dot={false}
                    name="1 lb/wk pace"
                  />
                  <Line
                    type="monotone"
                    dataKey="trendLow"
                    stroke="#bfdbfe"
                    strokeDasharray="4 4"
                    dot={false}
                    name="0.5 lb/wk pace"
                  />
                  <Line type="monotone" dataKey="weight" stroke="#1d4ed8" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Weekly rhythm scores"
              description={data.hasRealData ? "From daily deficit activity load" : "Sample trend"}
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.weeklyRhythmScores}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis domain={[60, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="score" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="cycling" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              title="Weekly volume"
              value={`${data.cycling.volumeHours} h`}
              hint="Last 7 days · outdoor + trainer"
            />
            <KpiCard
              title="Zone 2 estimate"
              value={`${data.cycling.zone2Hours} h`}
              hint="~55% of cycling duration (HR zones when meter syncs)"
            />
            <KpiCard
              title="Longest ride"
              value={`${data.cycling.longestRideMiles} mi`}
              hint="Build toward century weeks"
            />
          </div>
          <ChartCard
            title="Watts / kg (trend)"
            description="From power meter activities when available"
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.cycling.wkgTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Line type="monotone" dataKey="wkg" stroke="#059669" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="strength" className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <Dumbbell className="h-4 w-4" />
            Garmin strength — Chest & Triceps, Back & Biceps, Shoulders & Core
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.strength.map((s) => (
              <Card key={`${s.label}-${s.last}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.label}</CardTitle>
                  <CardDescription>Last: {s.last}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-[var(--muted-foreground)]">Duration:</span> {s.durationMin}{" "}
                    min
                  </p>
                  {s.volumeKg != null ? (
                    <p>
                      <span className="text-[var(--muted-foreground)]">Volume est.:</span>{" "}
                      {Math.round(s.volumeKg)} kg
                    </p>
                  ) : null}
                  <p className="text-[var(--muted-foreground)]">{s.loadHint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.strengthVolumeBySession.length > 0 ? (
            <ChartCard
              title="Session volume (reps × weight)"
              description="Lb-equivalent volume when weights are recorded in Garmin"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.strengthVolumeBySession}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : Number(value);
                      return [
                        Number.isFinite(n) ? `${Math.round(n).toLocaleString()} lb·reps` : "",
                        "Volume",
                      ];
                    }}
                    labelFormatter={(_, payload) => {
                      const item = Array.isArray(payload) ? payload[0] : undefined;
                      const p = item?.payload as { workout?: string; dateLabel?: string } | undefined;
                      return p ? `${p.dateLabel ?? ""} · ${p.workout ?? ""}` : "";
                    }}
                  />
                  <Bar dataKey="volumeLbs" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Sets & weights</h3>
            {data.strengthSessions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Run a Garmin sync after your next dumbbell session to populate per-exercise sets.
              </p>
            ) : (
              data.strengthSessions.map((session) => (
                <Card key={session.garmin_activity_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{session.workout_name}</CardTitle>
                    <CardDescription>
                      {session.dateLabel}
                      {session.activity_name ? ` · ${session.activity_name}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                          <th className="py-2 pr-3 font-medium">Exercise</th>
                          <th className="py-2 pr-3 font-medium">Set</th>
                          <th className="py-2 pr-3 font-medium">Reps</th>
                          <th className="py-2 pr-3 font-medium">Weight (lb)</th>
                          <th className="py-2 pr-3 font-medium">Weight (kg)</th>
                          <th className="py-2 pr-3 font-medium">Rest (s)</th>
                          <th className="py-2 pr-3 font-medium">Volume</th>
                          <th className="py-2 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.rows.map((row, idx) => (
                          <tr
                            key={`${session.garmin_activity_id}-${idx}`}
                            className="border-b border-[var(--border)]/60"
                          >
                            <td className="py-2 pr-3">{row.exercise_name}</td>
                            <td className="py-2 pr-3">{row.set_number}</td>
                            <td className="py-2 pr-3">{row.reps ?? "—"}</td>
                            <td className="py-2 pr-3">
                              {row.weight_lbs != null ? Math.round(Number(row.weight_lbs) * 10) / 10 : "—"}
                            </td>
                            <td className="py-2 pr-3">
                              {row.weight_kg != null ? Math.round(Number(row.weight_kg) * 100) / 100 : "—"}
                            </td>
                            <td className="py-2 pr-3">{row.rest_seconds ?? "—"}</td>
                            <td className="py-2 pr-3">
                              {row.volume_lbs != null
                                ? Math.round(row.volume_lbs).toLocaleString()
                                : "—"}
                            </td>
                            <td className="max-w-[200px] truncate py-2 text-[var(--muted-foreground)]" title={row.notes ?? ""}>
                              {row.notes ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="nutrition" className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
              <Utensils className="h-4 w-4" />
              MacrosFirst bridge
            </div>
            <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
              calories_in placeholder
            </span>
            {profile?.wednesday_lunch_relax !== false && (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  isWednesday
                    ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                Wednesday lunch relax · +{data.nutrition.wednesdayBonusKcal} kcal budget (auto)
              </span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Avg calories (7d)" value={`${data.nutrition.caloriesAvg}`} hint="" />
            <KpiCard title="Protein g" value={`${data.nutrition.proteinG}`} hint="" />
            <KpiCard title="Carbs g" value={`${data.nutrition.carbsG}`} hint="" />
            <KpiCard title="Fat g" value={`${data.nutrition.fatG}`} hint="" />
          </div>
          <ChartCard
            title="Deficit vs target (kcal)"
            description={`Latest daily gap vs ${profile?.target_calories ?? 3000} kcal target · Garmin burn + BMR est.`}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.deficitBarChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="kcal" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="rhythm" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  Garmin auto signals
                </CardTitle>
                <CardDescription>Sleep · HRV · RHR · recovery</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[var(--muted-foreground)]">Sleep</p>
                  <p className="text-lg font-semibold">{data.garmin.sleepHours} h</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">HRV</p>
                  <p className="text-lg font-semibold">{data.garmin.hrvMs} ms</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">Resting HR</p>
                  <p className="text-lg font-semibold">{data.garmin.restingHr} bpm</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">Recovery</p>
                  <p className="text-lg font-semibold">{data.garmin.recoveryScore}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Moon className="h-4 w-4" />
                  Quick sliders
                </CardTitle>
                <CardDescription>Family & work stress — feeds Rhythm Score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Family load ({familyLoad[0]})</Label>
                  <Slider
                    value={familyLoad}
                    onValueChange={setFamilyLoad}
                    max={100}
                    step={1}
                    aria-label="Family load"
                  />
                </div>
                <div className="space-y-3">
                  <Label>Work load ({workLoad[0]})</Label>
                  <Slider
                    value={workLoad}
                    onValueChange={setWorkLoad}
                    max={100}
                    step={1}
                    aria-label="Work load"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Weekly rhythm trend lives in Today&apos;s Snapshot — adjust sliders here to stress-test
            today&apos;s score.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={grokOpen} onOpenChange={setGrokOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Weekly package for Grok</DialogTitle>
            <DialogDescription>
              Last 7 days of training context. Copy JSON for xAI — live Grok integration next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--muted)] p-4 text-xs leading-relaxed text-[var(--foreground)]">
              {grokJson}
            </pre>
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm text-[var(--muted-foreground)]">
              <p className="font-medium text-[var(--foreground)]">Placeholder Grok reply</p>
              <p className="mt-2">
                &ldquo;Base phase looks sustainable: hold Zone 2 volume, keep strength splits as
                scheduled, and protect Wednesday lunch. Fat-loss pace is tracking the 0.5–1 lb/wk
                corridor.&rdquo;
              </p>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(grokJson);
              }}
            >
              Copy JSON to clipboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pl-0">{children}</CardContent>
    </Card>
  );
}
