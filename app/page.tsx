import type { ReactNode } from "react";
import Link from "next/link";
import { Bike, LineChart, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-[var(--border)] bg-gradient-to-b from-sky-50/80 to-[var(--background)] px-4 py-16 dark:from-sky-950/30 dark:to-[var(--background)] sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            LOTOJA 2026 · Team Training OS
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
            Train fast at dawn. Protect the routine. Race September strong.
          </h1>
          <p className="max-w-2xl text-lg text-[var(--muted-foreground)]">
            A solo dashboard for Brett — KPIs, cycling base, Garmin strength, nutrition placeholders,
            and Grok-ready weekly exports. Built for 6:45 a.m. clarity.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="font-semibold">
              <Link href="/login">Open dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-6 px-4 py-14 sm:grid-cols-3 sm:px-8">
        <Feature
          icon={<LineChart className="h-5 w-5 text-sky-600" />}
          title="Fat-loss + readiness"
          body="Weight trend, safe weekly loss band, LOTOJA readiness — without clutter."
        />
        <Feature
          icon={<Bike className="h-5 w-5 text-emerald-600" />}
          title="Cycling base"
          body="Volume, Zone 2, longest ride, watts/kg trend placeholders."
        />
        <Feature
          icon={<Shield className="h-5 w-5 text-indigo-600" />}
          title="Supabase RLS"
          body="Each user only sees their row — deploy SQL in Supabase once."
        />
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{body}</p>
    </div>
  );
}
