"use client";

import { useMemo, useState } from "react";

import { logStrengthSession } from "@/actions/log-strength";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SPLITS = ["Chest & Triceps", "Back & Biceps", "Shoulders & Core"] as const;

type Row = { exercise: string; reps: string; weight_lbs: string };

export function ManualStrengthForm() {
  const [workout, setWorkout] = useState<string>(SPLITS[0]);
  const [rows, setRows] = useState<Row[]>([
    { exercise: "", reps: "10", weight_lbs: "25" },
  ]);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const setsJson = useMemo(() => {
    const parsed = rows
      .map((r) => ({
        exercise: r.exercise.trim(),
        reps: Number.parseInt(r.reps, 10),
        weight_lbs: Number.parseFloat(r.weight_lbs),
      }))
      .filter((r) => r.exercise.length > 0);
    return JSON.stringify(parsed);
  }, [rows]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("workout", workout);
    fd.set("sets_json", setsJson);
    const result = await logStrengthSession(fd);
    setPending(false);
    if (!result.ok) {
      setMsg(result.error ?? "Could not save");
      return;
    }
    setMsg("Logged. Refreshing…");
    window.location.reload();
  }

  return (
    <Card className="border-indigo-200/40 dark:border-indigo-900/40">
      <CardHeader>
        <CardTitle className="text-base">Log a strength session</CardTitle>
        <CardDescription>
          Basement block — add exercises and sets (lb). Saved to your account immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="split">Split</Label>
            <select
              id="split"
              className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={workout}
              onChange={(e) => setWorkout(e.target.value)}
            >
              {SPLITS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Exercise"
                  value={row.exercise}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], exercise: e.target.value };
                    setRows(next);
                  }}
                />
                <Input
                  placeholder="Reps"
                  inputMode="numeric"
                  value={row.reps}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], reps: e.target.value };
                    setRows(next);
                  }}
                />
                <Input
                  placeholder="Weight (lb)"
                  inputMode="decimal"
                  value={row.weight_lbs}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], weight_lbs: e.target.value };
                    setRows(next);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((r) => [...r, { exercise: "", reps: "10", weight_lbs: "25" }])}
            >
              Add set row
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save session"}
            </Button>
          </div>
          {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
