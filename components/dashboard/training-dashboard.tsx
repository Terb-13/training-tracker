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
import { Activity, ChevronDown, ChevronRight, Dumbbell, Moon, Settings, Target, Utensils } from "lucide-react";

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
import { ManualStrengthForm } from "@/components/dashboard/manual-strength-form";
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
  const [expandedStrengthKey, setExpandedStrengthKey] = useState<string | null>(null);

  const currentWeight = data.weightSeries[data.weightSeries.length - 1]?.weight ?? 204.2;
  const weeklyLoss = data.weeklyLossLb;

  const todayRhythm = useMemo(() => {
    const base = data.recovery.recoveryScore;
    const adj = (familyLoad[0] + workLoad[0]) / 2;
    return Math.min(100, Math.max(40, Math.round(base - adj * 0.08 + 12)));
  }, [familyLoad, workLoad, data.recovery.recoveryScore]);

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
          hasSession: s.hasSession,
        })),
        recoveryHealth: {
          sleepH: data.recovery.sleepHours,
          hrvMs: data.recovery.hrvMs,
          restingHr: data.recovery.restingHr,
          recoveryScore: data.recovery.recoveryScore,
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
              Last Strava sync: {new Date(data.lastSyncAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              No Strava sync yet — connect in Settings, then sync rides.
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
                Settings
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
              hint={
                data.hasRealData
                  ? "From your weight log (body composition)"
                  : "Log weight in Settings for a live curve"
              }
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
              hint="Recovery signals + family/work load"
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
              description={data.hasRealData ? "From logged weights" : "Illustrative trend until you log weight"}
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
              description={data.hasRealData ? "From daily deficit activity load" : "Placeholder until deficit data fills in"}
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
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <Dumbbell className="h-4 w-4 shrink-0" />
            <span>
              Last 30 days logged — upper-body durability for September&apos;s 200 miles: short basement
              sessions, big payoff on the climbs.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-indigo-200/50 bg-indigo-50/40 dark:border-indigo-900/50 dark:bg-indigo-950/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  This week
                </CardTitle>
                <CardDescription>{data.strengthWeekly.weekLabel} · Mon–Sun</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {data.strengthWeekly.sessionsDone}{" "}
                  <span className="text-base font-normal text-[var(--muted-foreground)]">
                    / {data.strengthWeekly.sessionsTarget} sessions
                  </span>
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Strength sessions logged this calendar week — {data.strengthWeekly.sessionsTarget} per week supports
                  LOTOJA pulls and neck stability on long days.
                </p>
              </CardContent>
            </Card>
            {data.strength.map((s) => (
              <Card
                key={s.label}
                className={
                  s.hasSession
                    ? "border-emerald-200/40 dark:border-emerald-900/40"
                    : "opacity-85 ring-1 ring-dashed ring-[var(--border)]"
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.label}</CardTitle>
                  <CardDescription>Last session: {s.last}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-[var(--muted-foreground)]">Duration:</span>{" "}
                    {s.hasSession ? `${s.durationMin} min` : "—"}
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

          {data.strengthProgressionChart.length > 0 && data.strengthProgressionSeries.length > 0 ? (
            <ChartCard
              title="Avg weight (lb) per exercise"
              description="Weighted by reps when weight is logged; top lifts over the last 30 days"
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.strengthProgressionChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  {data.strengthProgressionSeries.map((s, i) => {
                    const colors = ["#6366f1", "#059669", "#d97706", "#7c3aed"];
                    return (
                      <Line
                        key={s.dataKey}
                        type="monotone"
                        dataKey={s.dataKey}
                        name={s.exerciseName}
                        stroke={colors[i % colors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {data.strengthVolumeBySession.length > 0 ? (
            <ChartCard
              title="Session volume (reps × weight)"
              description="Lb-equivalent volume when weights are logged"
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

          <ManualStrengthForm />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Workouts & sets</h3>
            {data.strengthSessions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No strength workouts in the last 30 days. Log a session above or sync Strava if you track lifts
                elsewhere.
              </p>
            ) : (
              data.strengthSessions.map((session) => (
                <Card key={session.external_activity_id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{session.workout_name}</CardTitle>
                        <CardDescription>
                          {session.dateLabel}
                          {session.activity_name ? ` · ${session.activity_name}` : ""}
                        </CardDescription>
                      </div>
                      {session.totalVolumeLbs > 0 ? (
                        <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">
                          {Math.round(session.totalVolumeLbs).toLocaleString()} lb·reps total
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {session.exercises.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">No per-set rows for this session.</p>
                    ) : (
                      session.exercises.map((ex) => {
                        const exKey = `${session.external_activity_id}::${ex.exercise_name}`;
                        const open = expandedStrengthKey === exKey;
                        return (
                          <div
                            key={exKey}
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)]"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm transition hover:bg-[var(--muted)]/40"
                              onClick={() => setExpandedStrengthKey(open ? null : exKey)}
                            >
                              <span className="min-w-0 font-medium text-[var(--foreground)]">
                                {ex.exercise_name}
                              </span>
                              <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted-foreground)]">
                                <span>{ex.setCount} sets</span>
                                {ex.avgWeightLbs != null ? (
                                  <span className="tabular-nums">avg {ex.avgWeightLbs} lb</span>
                                ) : null}
                                {ex.totalVolumeLbs != null ? (
                                  <span className="tabular-nums">vol {Math.round(ex.totalVolumeLbs).toLocaleString()}</span>
                                ) : null}
                                {open ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </button>
                            {open ? (
                              <div className="border-t border-[var(--border)] px-2 pb-3 pt-1">
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[520px] border-collapse text-xs sm:text-sm">
                                    <thead>
                                      <tr className="text-left text-[var(--muted-foreground)]">
                                        <th className="py-2 pr-2 font-medium">Set</th>
                                        <th className="py-2 pr-2 font-medium">Reps</th>
                                        <th className="py-2 pr-2 font-medium">lb</th>
                                        <th className="py-2 pr-2 font-medium">kg</th>
                                        <th className="py-2 pr-2 font-medium">Rest</th>
                                        <th className="py-2 pr-2 font-medium">Vol</th>
                                        <th className="py-2 font-medium">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ex.sets.map((row, idx) => (
                                        <tr key={`${exKey}-${idx}`} className="border-b border-[var(--border)]/50">
                                          <td className="py-2 pr-2">{row.set_number}</td>
                                          <td className="py-2 pr-2">{row.reps ?? "—"}</td>
                                          <td className="py-2 pr-2 tabular-nums">
                                            {row.weight_lbs != null
                                              ? Math.round(Number(row.weight_lbs) * 10) / 10
                                              : "—"}
                                          </td>
                                          <td className="py-2 pr-2 tabular-nums">
                                            {row.weight_kg != null
                                              ? Math.round(Number(row.weight_kg) * 100) / 100
                                              : "—"}
                                          </td>
                                          <td className="py-2 pr-2">{row.rest_seconds ?? "—"}</td>
                                          <td className="py-2 pr-2 tabular-nums">
                                            {row.volume_lbs != null
                                              ? Math.round(row.volume_lbs).toLocaleString()
                                              : "—"}
                                          </td>
                                          <td className="max-w-[180px] truncate py-2 text-[var(--muted-foreground)]" title={row.notes ?? ""}>
                                            {row.notes ?? "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
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
              Macros bridge (calories_in) coming soon
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
            description={`Latest daily gap vs ${profile?.target_calories ?? 3000} kcal target · Strava burn + BMR est.`}
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
                  Recovery signals
                </CardTitle>
                <CardDescription>Sleep · HRV · RHR · recovery</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[var(--muted-foreground)]">Sleep</p>
                  <p className="text-lg font-semibold">{data.recovery.sleepHours} h</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">HRV</p>
                  <p className="text-lg font-semibold">{data.recovery.hrvMs} ms</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">Resting HR</p>
                  <p className="text-lg font-semibold">{data.recovery.restingHr} bpm</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">Recovery</p>
                  <p className="text-lg font-semibold">{data.recovery.recoveryScore}</p>
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
