import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon, RadarIcon, ShieldCheckIcon } from "lucide-react";

import { ScanResultCard } from "@/components/scan-result-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parsePullRequestUrl } from "@/lib/github";
import { PublicAuditError, getPublicAudit, type PublicAudit } from "@/lib/report";
import type { PullRequestRef, ScanRecord } from "@/lib/types";

/**
 * Public, unauthenticated audit report — the page a README badge or a shared
 * link lands on. The expensive pipeline result comes from the data cache
 * (6h TTL, see lib/report.ts); the page itself renders per-request so the
 * "audited N ago" footer stays honest.
 */
export const dynamic = "force-dynamic";

interface Params {
  owner: string;
  repo: string;
  number: string;
}

function parseParams(params: Params): PullRequestRef | null {
  try {
    return parsePullRequestUrl(
      `https://github.com/${params.owner}/${params.repo}/pull/${params.number}`
    );
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const ref = parseParams(await params);
  if (!ref) return { title: "SlopShield — report not found" };

  const slug = `${ref.owner}/${ref.repo}#${ref.number}`;
  try {
    const audit = await getPublicAudit(ref);
    const title = `${slug} — ${audit.audit.riskScore}/100 ${audit.audit.riskLevel} slop risk`;
    const description = audit.audit.reviewerWarning;
    const ogImage = `/api/og/${ref.owner}/${ref.repo}/${ref.number}?score=${audit.audit.riskScore}&level=${audit.audit.riskLevel}`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImage, width: 1200, height: 630 }],
      },
      twitter: { card: "summary_large_image", title, description, images: [ogImage] },
    };
  } catch {
    return { title: `${slug} — SlopShield audit` };
  }
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const ref = parseParams(await params);
  if (!ref) notFound();

  let audit: PublicAudit;
  try {
    audit = await getPublicAudit(ref);
  } catch (err) {
    if (err instanceof PublicAuditError && err.kind === "not_found") {
      notFound();
    }
    const message =
      err instanceof PublicAuditError
        ? err.message
        : "The audit pipeline hit an unexpected error.";
    return (
      <PublicShell>
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RadarIcon className="size-4" />
              Audit temporarily unavailable
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Nothing is cached for{" "}
            <span className="font-mono">
              {ref.owner}/{ref.repo}#{ref.number}
            </span>{" "}
            yet — reload in a moment and the audit will run fresh.
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  const scan = toScanRecord(audit);

  return (
    <PublicShell>
      <TooltipProvider>
        <div className="space-y-4">
          <ScanResultCard scan={scan} metrics={audit.metrics} shareable={false} />
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="size-3" aria-hidden />
            Audited {relativeTime(audit.auditedAt)} from behavioral telemetry only — the
            model never saw the diff. Public reports refresh at most every 6 hours.
          </p>
        </div>
      </TooltipProvider>
    </PublicShell>
  );
}

/** Shared chrome for the public surface: brand header with a sign-in CTA. */
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">SlopShield AI</span>
            <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
              Public report
            </span>
          </Link>
          <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
            Audit your own PR
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}

/** Adapts the cached public audit to the ScanRecord shape the verdict card renders. */
function toScanRecord(audit: PublicAudit): ScanRecord {
  return {
    id: `public-${audit.repoFullName}-${audit.prNumber}`,
    pr_url: audit.prUrl,
    repo_full_name: audit.repoFullName,
    pr_number: audit.prNumber,
    pr_title: audit.title,
    pr_author: audit.author,
    additions: audit.additions,
    deletions: audit.deletions,
    changed_files: audit.changedFiles,
    commit_count: audit.commitCount,
    first_commit_at: audit.firstCommitAt,
    pr_created_at: audit.prCreatedAt,
    code_velocity: audit.metrics.codeVelocityPerHour,
    churn_per_file: audit.metrics.churnPerFile,
    addition_dominance: audit.metrics.additionDominance,
    test_file_ratio: audit.metrics.testFileRatio,
    risk_score: audit.audit.riskScore,
    risk_level: audit.audit.riskLevel,
    reviewer_warning: audit.audit.reviewerWarning,
    fragility_score: audit.audit.fragilityScore,
    key_signals: audit.audit.keySignals,
    created_at: audit.auditedAt,
  };
}

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
