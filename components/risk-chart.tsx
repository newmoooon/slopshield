"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RiskBadge } from "@/components/risk-badge";
import type { ScanRecord } from "@/lib/types";

/**
 * Risk-score-over-time — a single-series area chart per the dataviz method:
 * one hue (the series blue, validated ≥3:1 on the dark surface), recessive
 * horizontal-only gridlines, muted axis ink, a crosshair tooltip by default,
 * and no legend box (the card title names the lone series). The HIGH
 * threshold at 50 is annotated with a dashed reference line in the reserved
 * "serious" status color, labeled so the meaning never rides on color alone.
 */

const SERIES = "var(--viz-series)";
const GRID = "var(--viz-grid)";
const AXIS_INK = "var(--viz-muted)";
const THRESHOLD = "var(--status-serious)";

interface ChartPoint {
  timestamp: number;
  score: number;
  scan: ScanRecord;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function ScanTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const { scan } = point;

  return (
    <div className="rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">
        {dateTimeFormatter.format(new Date(scan.created_at))}
      </p>
      <p className="mt-1 max-w-56 truncate font-mono text-xs">
        {scan.repo_full_name}#{scan.pr_number}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {scan.risk_score}
        </span>
        <RiskBadge level={scan.risk_level} />
      </div>
    </div>
  );
}

export function RiskChart({ scans }: { scans: ScanRecord[] }) {
  const data = useMemo<ChartPoint[]>(
    () =>
      [...scans]
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map((scan) => ({
          timestamp: new Date(scan.created_at).getTime(),
          score: scan.risk_score,
          scan,
        })),
    [scans]
  );

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Run at least two scans to unlock the risk trend.
      </div>
    );
  }

  return (
    <div className="h-64 w-full" role="img" aria-label="AI slop risk score across your scan history">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />

          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
            tick={{ fill: AXIS_INK, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--viz-axis)" }}
            tickMargin={8}
            minTickGap={48}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: AXIS_INK, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />

          <Tooltip
            content={<ScanTooltip />}
            cursor={{ stroke: AXIS_INK, strokeDasharray: "3 3", strokeWidth: 1 }}
          />

          <ReferenceLine
            y={50}
            stroke={THRESHOLD}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: "High-risk threshold",
              position: "insideTopRight",
              fill: THRESHOLD,
              fontSize: 10,
            }}
          />

          <Area
            type="monotone"
            dataKey="score"
            stroke={SERIES}
            strokeWidth={2}
            fill="url(#riskFill)"
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: SERIES, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
