"use client";

import { Trash2Icon } from "lucide-react";

import { RiskBadge } from "@/components/risk-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCompact } from "@/lib/metrics";
import type { ScanRecord } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Tabular view of the scan history — this is also the chart's accessible
 * "table view" (dataviz relief rule), so every figure on the chart is
 * readable as text here.
 */
export function ScanHistoryTable({
  scans,
  onDelete,
  deletingId,
}: {
  scans: ScanRecord[];
  onDelete?: (scanId: string) => void;
  deletingId?: string | null;
}) {
  if (scans.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No scans yet — analyze your first Pull Request above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scanned</TableHead>
            <TableHead>Pull Request</TableHead>
            <TableHead className="text-right">Velocity</TableHead>
            <TableHead className="text-right">Churn/file</TableHead>
            <TableHead className="text-right">Fragility</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Verdict</TableHead>
            {onDelete ? <TableHead className="w-px" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {scans.map((scan) => (
            <TableRow key={scan.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {dateFormatter.format(new Date(scan.created_at))}
              </TableCell>
              <TableCell className="max-w-64">
                <a
                  href={scan.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-xs hover:underline"
                  title={scan.pr_title}
                >
                  {scan.repo_full_name}#{scan.pr_number}
                </a>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCompact(scan.code_velocity)}/h
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCompact(scan.churn_per_file)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {scan.fragility_score}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {scan.risk_score}
              </TableCell>
              <TableCell>
                <RiskBadge level={scan.risk_level} />
              </TableCell>
              {onDelete ? (
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete scan of ${scan.repo_full_name}#${scan.pr_number}`}
                    disabled={deletingId === scan.id}
                    onClick={() => onDelete(scan.id)}
                  >
                    <Trash2Icon className="text-muted-foreground" />
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
