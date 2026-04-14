"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const err = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(err ? "Authentication failed." : null);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function handleSignUp() {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Check your email to confirm, then sign in.");
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Magic link sent — check your inbox.");
  }

  return (
    <Card className="w-full max-w-md border-[var(--border)] shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
        <CardDescription>Email + password or magic link — same Supabase session.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>
          <TabsContent value="password" className="space-y-4 pt-4">
            <form className="space-y-4" onSubmit={onPasswordSignIn}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {message ? <p className="text-sm text-amber-700 dark:text-amber-300">{message}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={loading}
                onClick={handleSignUp}
              >
                Create account
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="magic" className="space-y-4 pt-4">
            <form className="space-y-4" onSubmit={onMagicLink}>
              <div className="space-y-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {message ? <p className="text-sm text-sky-800 dark:text-sky-200">{message}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                Send magic link
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          <Link href="/" className="underline underline-offset-4 hover:text-[var(--foreground)]">
            Back home
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
