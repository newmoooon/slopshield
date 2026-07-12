"use client";

import { useState } from "react";
import {
  ActivityIcon,
  BanknoteIcon,
  CheckIcon,
  ClipboardIcon,
  ExternalLinkIcon,
  FileStackIcon,
  FlaskConicalIcon,
  GaugeIcon,
  GitCommitHorizontalIcon,
  HourglassIcon,
  PlusIcon,
  RadarIcon,
  Share2Icon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { BadgeSnippet } from "@/components/badge-snippet";
import { RiskBadge, riskLevelTextClass } from "@/components/risk-badge";
import { StatTile } from "@/components/stat-tile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatCompact,
  formatCurrency,
  formatHours,
} from "@/lib/metrics";
import type { CrunchedMetrics, ScanRecord } from "@/lib/types";

/** Renders the verdict as a GitHub-flavored Markdown review comment, so the
 *  audit lands where the merge decision actually happens. */
function buildPrComment(scan: ScanRecord, metrics: CrunchedMetrics): string {
  // Model-authored text can contain newlines or pipes that would break the
  // blockquote / table structure of the generated Markdown — flatten them.
  const flat = (text: string) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  const signals = scan.key_signals.length
    ? `\n**Key signals:** ${scan.key_signals.map(flat).join(" · ")}\n`
    : "";
  return `## 🛡️ SlopShield audit — **${scan.risk_score}/100 · ${scan.risk_level}**

> ${flat(scan.reviewer_warning)}

| Behavioral signal | Value |
| --- | --- |
| Code velocity | ${formatCompact(metrics.codeVelocityPerHour)} lines/h over a ${formatHours(metrics.devWindowHours)} dev window |
| Churn density | ${formatCompact(metrics.churnPerFile)} lines/file across ${scan.changed_files} files |
| Addition dominance | ${Math.round(metrics.additionDominance * 100)}% (+${formatCompact(scan.additions)} / −${formatCompact(scan.deletions)}) |
| Test movement | ${Math.round(metrics.testFileRatio * 100)}% of touched files |
| Commits | ${scan.commit_count} |
| Est. review burden | ${formatHours(metrics.estReviewHours)} |
${signals}
<sub>Verdict from PR behavioral telemetry only — the model never saw the diff. · [SlopShield](${scan.pr_url})</sub>`;
}

/**
 * Verdict panel for the most recent scan: a hero risk figure (a number is the
 * message — no gauge chart), the two-sentence reviewer warning, the crunched
 * telemetry grid, and Gemini's key signals.
 */
export function ScanResultCard({
  scan,
  metrics,
  shareable = true,
}: {
  scan: ScanRecord;
  metrics: CrunchedMetrics;
  /** Hide the share button on the public report page itself. */
  shareable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyPrComment() {
    try {
      await navigator.clipboard.writeText(buildPrComment(scan, metrics));
      setCopied(true);
      toast.success("Verdict copied — paste it into the PR review thread.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  }

  async function copyReportLink() {
    try {
      const url = `${window.location.origin}/report/${scan.repo_full_name}/${scan.pr_number}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast.success("Public report link copied — anyone can open it, no sign-in.");
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-normal text-muted-foreground">
                {scan.repo_full_name}#{scan.pr_number}
              </span>
              <a
                href={scan.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Open Pull Request on GitHub"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-1">
              {scan.pr_title} · by {scan.pr_author}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {shareable ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-dashed"
                onClick={copyReportLink}
              >
                {linkCopied ? (
                  <CheckIcon className="size-3.5" aria-hidden />
                ) : (
                  <Share2Icon className="size-3.5" aria-hidden />
                )}
                Share report
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-dashed"
              onClick={copyPrComment}
            >
              {copied ? (
                <CheckIcon className="size-3.5" aria-hidden />
              ) : (
                <ClipboardIcon className="size-3.5" aria-hidden />
              )}
              Copy as PR comment
            </Button>
            <RiskBadge level={scan.risk_level} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <BadgeSnippet repoFullName={scan.repo_full_name} prNumber={scan.pr_number} />
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              AI Slop Risk Score
            </p>
            <p className="text-6xl font-semibold tabular-nums">
              {scan.risk_score}
              <span className="text-2xl text-muted-foreground">/100</span>
            </p>
          </div>

          <div className="min-w-40 flex-1">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <WrenchIcon className="size-3" aria-hidden />
                Maintenance fragility
              </span>
              <span className={`font-medium tabular-nums ${riskLevelTextClass(scan.risk_level)}`}>
                {scan.fragility_score}/100
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-viz-series transition-all"
                style={{ width: `${scan.fragility_score}%` }}
                role="meter"
                aria-valuenow={scan.fragility_score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Maintenance fragility score"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Predicted likelihood of rework within two quarters
            </p>
          </div>
        </div>

        <Alert>
          <RadarIcon />
          <AlertTitle>Reviewer warning</AlertTitle>
          <AlertDescription>{scan.reviewer_warning}</AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Code velocity"
            value={`${formatCompact(metrics.codeVelocityPerHour)}/h`}
            detail={`${formatHours(metrics.devWindowHours)} dev window`}
            icon={GaugeIcon}
            hint="Lines added per hour between the first commit and PR creation. Sustained human pace is under ~150/h."
          />
          <StatTile
            label="Churn density"
            value={formatCompact(metrics.churnPerFile)}
            detail={`across ${scan.changed_files} files`}
            icon={FileStackIcon}
            hint="Total changed lines per file. Very high density suggests monolithic generated dumps."
          />
          <StatTile
            label="Addition dominance"
            value={`${Math.round(metrics.additionDominance * 100)}%`}
            detail={`+${formatCompact(scan.additions)} / −${formatCompact(scan.deletions)}`}
            icon={PlusIcon}
            hint="Share of the churn that is pure addition. Near 100% means paste without pruning — a classic slop signature."
          />
          <StatTile
            label="Test movement"
            value={`${Math.round(metrics.testFileRatio * 100)}%`}
            detail={`largest file +${formatCompact(metrics.largestFileAdditions)}`}
            icon={FlaskConicalIcon}
            hint="Fraction of touched files that are tests. Healthy changes move tests alongside source."
          />
          <StatTile
            label="Commits"
            value={String(scan.commit_count)}
            detail="on the PR branch"
            icon={GitCommitHorizontalIcon}
            hint="Commit count across the development window. One giant commit for thousands of lines is a red flag."
          />
          <StatTile
            label="Dev window"
            value={formatHours(metrics.devWindowHours)}
            detail="first commit → PR opened"
            icon={HourglassIcon}
            hint="Elapsed time between the earliest commit and the PR being opened."
          />
          <StatTile
            label="Review burden"
            value={formatHours(metrics.estReviewHours)}
            detail="at ~400 lines/hour"
            icon={ActivityIcon}
            hint="Estimated human hours for a thorough review of this churn."
          />
          <StatTile
            label="Review cost"
            value={formatCurrency(metrics.estReviewCostUsd)}
            detail="blended $85/h rate"
            icon={BanknoteIcon}
            hint="Localized estimate of what this review costs your org, formatted with Intl.NumberFormat."
          />
        </div>

        {scan.key_signals.length > 0 ? (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Key signals from the audit
              </p>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {scan.key_signals.map((signal) => (
                  <li key={signal} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-viz-series"
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
