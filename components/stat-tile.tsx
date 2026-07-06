import type { LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A single headline figure with its label and an explanatory tooltip — the
 * "stat tile" form from the dataviz method: no chart when one number is the
 * message. Values wear text ink, never a series color.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left" />
        }
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          <span className="text-xs font-medium tracking-wide uppercase">
            {label}
          </span>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {detail ? (
          <span className="text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-60">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
