"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PhaseProgressBarProps<P extends string> {
  /** Ordered list of phase steps to display */
  steps: P[];
  /** Current phase (or "failed"/"recovered" for terminal states) */
  current: P | "failed" | "recovered";
  /** Label for each phase shown in tooltip */
  labels: Record<P, string>;
}

export function PhaseProgressBar<P extends string>({
  steps,
  current,
  labels,
}: PhaseProgressBarProps<P>) {
  const isTerminalSpecial = current === "failed" || current === "recovered";
  const idx = isTerminalSpecial ? -1 : steps.indexOf(current as P);
  const isFailed = current === "failed";
  const isRecovered = current === "recovered";

  return (
    <div className="flex items-center gap-0.5 w-full">
      {steps.map((p, i) => {
        const isPast = idx >= 0 && i < idx;
        const isActive = i === idx;

        return (
          <TooltipProvider key={p} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center flex-1 last:flex-0">
                  <div
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-all duration-700",
                      isPast && "bg-success",
                      isActive && !isFailed && "bg-primary animate-pulse",
                      isActive && isFailed && "bg-destructive",
                      !isPast && !isActive && "bg-muted",
                      isFailed && !isActive && "bg-muted",
                      isRecovered && "bg-chart-4/30",
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] font-mono">
                {labels[p]}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
