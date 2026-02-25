"use client";

import { cn } from "@/lib/utils";
import { STATUS_ORDER, STATUS_LABELS, type BridgeStatus } from "@/lib/types";

interface StatusRailProps {
  currentStatus: BridgeStatus;
  error?: string;
}

export function StatusRail({ currentStatus, error }: StatusRailProps) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const isError = currentStatus === "error";

  // Filter out idle for the visual rail
  const displaySteps = STATUS_ORDER.filter((s) => s !== "idle");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Bridge Status
        </span>
        <span
          className={cn(
            "text-xs font-mono px-2 py-0.5 rounded",
            isError
              ? "bg-destructive/20 text-destructive-foreground"
              : currentStatus === "completed"
                ? "bg-success/20 text-success"
                : "bg-primary/20 text-primary"
          )}
        >
          {isError ? "ERROR" : STATUS_LABELS[currentStatus]}
        </span>
      </div>

      {/* Horizontal rail for desktop, vertical for compact display */}
      <div className="flex items-center gap-0">
        {displaySteps.map((step, i) => {
          const stepIndex = STATUS_ORDER.indexOf(step);
          const isActive = stepIndex === currentIndex;
          const isPast = stepIndex < currentIndex;
          const isFuture = stepIndex > currentIndex;

          return (
            <div key={step} className="flex items-center flex-1 last:flex-0">
              {/* Step dot */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all duration-500 shrink-0",
                    isError && isActive && "bg-destructive animate-pulse",
                    !isError && isPast && "bg-success",
                    !isError && isActive && "bg-primary animate-pulse",
                    isFuture && "bg-muted"
                  )}
                />
                <span
                  className={cn(
                    "text-[9px] font-mono leading-tight text-center hidden md:block",
                    isPast && "text-success",
                    isActive && !isError && "text-primary",
                    isActive && isError && "text-destructive-foreground",
                    isFuture && "text-muted-foreground/50"
                  )}
                >
                  {STATUS_LABELS[step]}
                </span>
              </div>

              {/* Connector line */}
              {i < displaySteps.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-1 transition-colors duration-500",
                    isPast ? "bg-success" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {isError && error && (
        <div className="mt-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-xs font-mono text-destructive-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
