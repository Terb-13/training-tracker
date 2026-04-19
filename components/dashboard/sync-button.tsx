"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Sync failed");
      } else {
        setMessage(json.message ?? "Synced");
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" disabled={loading} onClick={onSync} className="gap-2">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing…" : "Sync Strava now"}
      </Button>
      {message ? <p className="text-xs text-[var(--muted-foreground)]">{message}</p> : null}
    </div>
  );
}
