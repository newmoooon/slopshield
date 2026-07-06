import {
  OctagonAlertIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

/**
 * Status is never conveyed by color alone: every risk level pairs a reserved
 * status color with an icon and a text label (dataviz status-palette rule).
 */
const LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; icon: LucideIcon; className: string }
> = {
  LOW: {
    label: "Low risk",
    icon: ShieldCheckIcon,
    className: "border-status-good/40 bg-status-good/10 text-status-good",
  },
  MODERATE: {
    label: "Moderate risk",
    icon: ShieldAlertIcon,
    className: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  },
  HIGH: {
    label: "High risk",
    icon: TriangleAlertIcon,
    className: "border-status-serious/40 bg-status-serious/10 text-status-serious",
  },
  CRITICAL: {
    label: "Critical risk",
    icon: OctagonAlertIcon,
    className: "border-status-critical/40 bg-status-critical/10 text-status-critical",
  },
};

export function RiskBadge({
  level,
  className,
}: {
  level: RiskLevel;
  className?: string;
}) {
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      <Icon aria-hidden />
      {config.label}
    </Badge>
  );
}

/** Shared level→color lookup for non-badge accents (hero number, meters). */
export function riskLevelTextClass(level: RiskLevel): string {
  return {
    LOW: "text-status-good",
    MODERATE: "text-status-warning",
    HIGH: "text-status-serious",
    CRITICAL: "text-status-critical",
  }[level];
}
