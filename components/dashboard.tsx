"use client";

import { useMemo, useState, useTransition } from "react";
import {
  GitPullRequestIcon,
  Loader2Icon,
  ScanSearchIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { analyzePullRequest, deleteScan } from "@/app/actions";
import { RiskChart } from "@/components/risk-chart";
import { ScanHistoryTable } from "@/components/scan-history-table";
import { ScanResultCard } from "@/components/scan-result-card";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActivityIcon, FolderGit2Icon, GaugeIcon } from "lucide-react";
import { formatCompact } from "@/lib/metrics";
import type { CrunchedMetrics, ScanRecord } from "@/lib/types";

interface LatestResult {
  scan: ScanRecord;
  metrics: CrunchedMetrics;
}

export function Dashboard({
  initialScans,
  demo = false,
}: {
  initialScans: ScanRecord[];
  demo?: boolean;
}) {
  const [scans, setScans] = useState<ScanRecord[]>(initialScans);
  const [latest, setLatest] = useState<LatestResult | null>(null);
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [, startDeleteTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fleetStats = useMemo(() => {
    if (scans.length === 0) return null;
    const repos = new Set(scans.map((s) => s.repo_full_name)).size;
    const avgRisk =
      scans.reduce((sum, s) => sum + s.risk_score, 0) / scans.length;
    const flagged = scans.filter((s) => s.risk_score >= 50).length;
    return { repos, avgRisk, flagged };
  }, [scans]);

  function handleDelete(scanId: string) {
    if (deletingId) return;
    // Demo rows are sample data with synthetic ids — handle them locally so
    // the zero-credential tour never surfaces a server error.
    if (demo) {
      setScans((previous) => previous.filter((scan) => scan.id !== scanId));
      setLatest((previous) => (previous?.scan.id === scanId ? null : previous));
      toast.success("Scan removed (demo data only)");
      return;
    }
    setDeletingId(scanId);
    startDeleteTransition(async () => {
      const result = await deleteScan(scanId);
      if (!result.ok) {
        toast.error(result.error);
        setDeletingId(null);
        return;
      }
      setScans((previous) => previous.filter((scan) => scan.id !== scanId));
      setLatest((previous) => (previous?.scan.id === scanId ? null : previous));
      setDeletingId(null);
      toast.success("Scan deleted");
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (demo) {
      toast.info("Demo mode shows sample data only — sign in with GitHub to audit a real PR.");
      return;
    }

    startTransition(async () => {
      const result = await analyzePullRequest(url);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLatest({ scan: result.scan, metrics: result.metrics });
      setScans((previous) => [result.scan, ...previous]);
      setUrl("");
      toast.success(
        `Scored ${result.scan.repo_full_name}#${result.scan.pr_number}: ${result.scan.risk_score}/100`
      );
    });
  }

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {/* ── PR tracker input ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanSearchIcon className="size-4" />
              Audit a Pull Request
            </CardTitle>
            <CardDescription>
              Paste any public GitHub PR URL. SlopShield crunches its
              behavioral telemetry and asks Gemini for a slop-risk verdict.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <div className="relative flex-1">
                <GitPullRequestIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo/pull/1234"
                  className="pl-9 font-mono text-sm"
                  disabled={pending}
                  aria-label="GitHub Pull Request URL"
                />
              </div>
              <Button type="submit" disabled={pending || url.trim() === ""}>
                {pending ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Auditing…
                  </>
                ) : (
                  "Run audit"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Skeleton while the pipeline runs ─────────────────────── */}
        {pending ? (
          <Card aria-busy>
            <CardHeader>
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-end gap-8">
                <Skeleton className="h-16 w-40" />
                <Skeleton className="h-10 flex-1" />
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Latest verdict ───────────────────────────────────────── */}
        {latest && !pending ? (
          <ScanResultCard scan={latest.scan} metrics={latest.metrics} />
        ) : null}

        {/* ── Fleet stat tiles ─────────────────────────────────────── */}
        {fleetStats ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Repositories tracked"
              value={String(fleetStats.repos)}
              detail={`${scans.length} total scans`}
              icon={FolderGit2Icon}
              hint="Distinct repositories in your scan history."
            />
            <StatTile
              label="Average risk"
              value={formatCompact(fleetStats.avgRisk)}
              detail="across all scans"
              icon={GaugeIcon}
              hint="Mean AI Slop Risk Score across your history."
            />
            <StatTile
              label="Flagged PRs"
              value={String(fleetStats.flagged)}
              detail="scored 50 or above"
              icon={ActivityIcon}
              hint="Scans that crossed the high-risk threshold."
            />
          </div>
        ) : null}

        {/* ── Historical analytics ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              Risk score over time
            </CardTitle>
            <CardDescription>
              Every audited PR, plotted by scan time. The dashed line marks the
              high-risk threshold (50).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RiskChart scans={scans} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan history</CardTitle>
            <CardDescription>
              The chart above, as data — every audited PR with its crunched
              metrics and verdict.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScanHistoryTable scans={scans} onDelete={handleDelete} deletingId={deletingId} />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
