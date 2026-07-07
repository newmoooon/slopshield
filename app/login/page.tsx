"use client";

import { useState } from "react";
import {
  EyeIcon,
  GaugeIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

/* lucide-react no longer ships brand icons, so the GitHub mark is inlined. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

const FEATURE_BULLETS = [
  {
    icon: GaugeIcon,
    title: "Behavioral telemetry, not text scanning",
    body: "Code velocity, churn density, and addition dominance expose slop that prose detectors miss.",
  },
  {
    icon: SparklesIcon,
    title: "Gemini 2.5 Flash structured audits",
    body: "A Principal-DevOps-Auditor prompt with strict JSON schema returns a 0–100 risk verdict.",
  },
  {
    icon: LockIcon,
    title: "Row-level-secured history",
    body: "Every scan persists to Postgres behind Supabase RLS — your telemetry stays yours.",
  },
] as const;

export default function LoginPage() {
  const [pending, setPending] = useState(false);

  async function signInWithGitHub() {
    setPending(true);
    try {
      const supabase = createClient();
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${origin}/auth/callback?next=/` },
      });
      if (error) {
        throw error;
      }
      // Success navigates away; leave the spinner running.
    } catch (err) {
      console.error("[login] OAuth start failed:", err);
      toast.error("Could not reach GitHub sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <section className="space-y-8">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <ShieldCheckIcon className="size-4" aria-hidden />
            <span className="tracking-tight">slopshield</span>
            <span className="accent-italic text-xs">pull-request forensics</span>
          </div>

          <div className="space-y-5">
            <h1 className="max-w-md text-balance text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl">
              Ship code,
              <br />
              <span className="accent-italic font-normal">not slop.</span>
            </h1>
            <p className="max-w-md text-balance text-muted-foreground">
              Text detectors are trivially bypassed. SlopShield reads the{" "}
              <em>behavior</em> behind every Pull Request — how fast the code
              arrived, how it churned, whether tests moved with it — and calls
              the risk before your reviewers burn hours on it.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURE_BULLETS.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-dashed border-border p-4"
              >
                <feature.icon
                  className="mb-3 size-4 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm font-medium leading-snug">{feature.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Authenticate with GitHub to open your repository health console.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full rounded-full"
              size="lg"
              onClick={signInWithGitHub}
              disabled={pending}
            >
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <GitHubMark className="size-4" />
              )}
              Continue with GitHub
            </Button>
            <Button
              render={<a href="/demo" />}
              nativeButton={false}
              variant="outline"
              size="lg"
              className="w-full rounded-full border-dashed"
            >
              <EyeIcon className="size-4" aria-hidden />
              Explore the live demo — no account
            </Button>
            <Separator />
            <p className="text-xs text-muted-foreground">
              OAuth is brokered by Supabase Auth. SlopShield receives your
              public profile only — no repository write scopes are requested.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
