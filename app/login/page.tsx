import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[var(--background)] px-4 py-16">
      <Suspense fallback={<div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
