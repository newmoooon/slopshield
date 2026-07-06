import { redirect } from "next/navigation";
import { TerminalIcon } from "lucide-react";

import { Dashboard } from "@/components/dashboard";
import { SiteHeader } from "@/components/site-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { ScanRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Setup mode: render instructions instead of crashing on missing env vars.
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS scopes this to the signed-in user; the SDK parameterizes every value.
  const { data: scans, error } = await supabase
    .from("scans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[page] scan history fetch failed:", error);
  }

  return (
    <>
      <SiteHeader user={user} />
      <Dashboard initialScans={(scans as ScanRecord[] | null) ?? []} />
    </>
  );
}

function SetupNotice() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4" />
            SlopShield AI — finish setup
          </CardTitle>
          <CardDescription>
            Environment variables are missing, so the app is in setup mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Create a free Supabase project, then run{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                supabase/schema.sql
              </code>{" "}
              in its SQL Editor.
            </li>
            <li>
              Enable the GitHub provider under Authentication → Providers
              (create a GitHub OAuth App pointing at{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                https://YOUR-REF.supabase.co/auth/v1/callback
              </code>
              ).
            </li>
            <li>
              Copy{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                .env.example
              </code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                .env.local
              </code>{" "}
              and fill in every key (Supabase, Gemini, CRON_SECRET).
            </li>
            <li>Restart the dev server.</li>
          </ol>
          <p>
            Full instructions live in the project README, including the exact
            SQL and OAuth callback configuration.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
