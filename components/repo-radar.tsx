"use client";

import { useState, useTransition } from "react";
import {
  FolderGit2Icon,
  GaugeIcon,
  GitPullRequestIcon,
  Loader2Icon,
  RadarIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { analyzeRepository } from "@/app/actions";
import { RiskBadge, riskLevelTextClass } from "@/components/risk-badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatCompact, formatHours } from "@/lib/metrics";
import type { RadarResult } from "@/lib/types";

type RadarSuccess = Extract<RadarResult, { ok: true }>;

export function RepoRadar() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<RadarSuccess | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    startTransition(async () => {
      const sweep = await analyzeRepository(input);
      if (!sweep.ok) {
        toast.error(sweep.error);
        return;
      }
      setResult(sweep);
      setInput("");
      toast.success(
        sweep.scannedCount === 0
          ? `${sweep.repo}: no open PRs`
          : `Swept ${sweep.scannedCount} open PRs in ${sweep.repo}`
      );
    });
  }

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {/* ── Sweep input ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RadarIcon className="size-4" />
              Repo Radar
            </CardTitle>
            <CardDescription>
              Sweep a repository&apos;s open Pull Request queue in one audit.
              Every PR is scored relative to the repo&apos;s own baseline, then
              ranked so a maintainer knows what to review first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <FolderGit2Icon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="owner/repo  ·  or a github.com repository URL"
                  className="pl-9 font-mono text-sm"
                  disabled={pending}
                  aria-label="GitHub repository"
                />
              </div>
              <Button type="submit" disabled={pending || input.trim() === ""}>
                {pending ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Sweeping…
                  </>
                ) : (
                  "Sweep queue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Skeleton while the fan-out runs ──────────────────────── */}
        {pending ? (
          <Card aria-busy>
            <CardHeader>
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full" />
                ))}
              </div>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ) : null}

        {/* ── Sweep verdict ────────────────────────────────────────── */}
        {result && !pending ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-mono text-base">{result.repo}</CardTitle>
                  <RiskBadge level={result.repoRiskLevel} />
                </div>
                <CardDescription>
                  {result.scannedCount} of {result.openPrCount} open PRs audited
                  {result.openPrCount > result.scannedCount
                    ? " (most recently updated first)"
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-3">
                  <span
                    className={`text-5xl font-semibold tabular-nums ${riskLevelTextClass(result.repoRiskLevel)}`}
                  >
                    {result.repoRiskScore}
                  </span>
                  <span className="pb-1.5 text-sm text-muted-foreground">
                    / 100 queue-wide slop exposure
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {result.repoSummary}
                </p>
                {result.scannedCount > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatTile
                      label="Open PRs"
                      value={String(result.openPrCount)}
                      detail={`${result.scannedCount} audited this sweep`}
                      icon={GitPullRequestIcon}
                      hint="Open pull requests in the queue; sweeps audit the most recently updated ones."
                    />
                    <StatTile
                      label="Highest PR risk"
                      value={String(result.prs[0]?.riskScore ?? 0)}
                      detail={result.prs[0] ? `#${result.prs[0].number}` : undefined}
                      icon={TriangleAlertIcon}
                      hint="The riskiest PR in this sweep — review it first."
                    />
                    <StatTile
                      label="Flagged"
                      value={String(result.prs.filter((p) => p.riskScore >= 50).length)}
                      detail="scored 50 or above"
                      icon={GaugeIcon}
                      hint="PRs in this sweep that crossed the high-risk threshold."
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {result.prs.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Review order</CardTitle>
                  <CardDescription>
                    Open PRs ranked riskiest-first, with the decisive telemetry
                    signal behind each score.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pull Request</TableHead>
                          <TableHead className="text-right">Δ lines</TableHead>
                          <TableHead className="text-right">Velocity</TableHead>
                          <TableHead className="text-right">Dev window</TableHead>
                          <TableHead className="text-right">Tests</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead>Signal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.prs.map((pr) => (
                          <TableRow key={pr.number}>
                            <TableCell className="max-w-72">
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate font-mono text-xs hover:underline"
                                title={pr.title}
                              >
                                #{pr.number} {pr.title}
                              </a>
                              <span className="text-xs text-muted-foreground">
                                by {pr.author}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap tabular-nums">
                              <span className="text-status-good">
                                +{formatCompact(pr.additions)}
                              </span>{" "}
                              <span className="text-status-critical">
                                −{formatCompact(pr.deletions)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCompact(pr.metrics.codeVelocityPerHour)}/h
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {pr.metrics.devWindowHours > 0
                                ? formatHours(pr.metrics.devWindowHours)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {Math.round(pr.metrics.testFileRatio * 100)}%
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold tabular-nums ${riskLevelTextClass(pr.riskLevel)}`}
                            >
                              {pr.riskScore}
                            </TableCell>
                            <TableCell className="max-w-64 text-xs text-muted-foreground">
                              <span className="block truncate" title={pr.note}>
                                {pr.note}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
