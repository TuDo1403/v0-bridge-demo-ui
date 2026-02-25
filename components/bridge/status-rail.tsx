"use client";

import { cn } from "@/lib/utils";
import { STATUS_ORDER, STATUS_LABELS, type BridgeStatus } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Bridge Status
        </span>
        <span
          className={cn(
            "text-[10px] font-mono px-2 py-0.5 rounded transition-colors duration-500",
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

      {/* Horizontal step rail */}
      <div className="flex items-center gap-0">
        {displaySteps.map((step, i) => {
          const stepIndex = STATUS_ORDER.indexOf(step);
          const isActive = stepIndex === currentIndex;
          const isPast = stepIndex < currentIndex;
          const isFuture = stepIndex > currentIndex;

          return (
            <div key={step} className="flex items-center flex-1 last:flex-0">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1.5 min-w-0">
                      <div
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition-all duration-700 shrink-0",
                          isError && isActive && "bg-destructive animate-pulse shadow-[0_0_8px_rgba(255,80,80,0.4)]",
                          !isError && isPast && "bg-success",
                          !isError && isActive && "bg-primary animate-pulse shadow-[0_0_8px_rgba(100,220,200,0.3)]",
                          isFuture && "bg-muted"
                        )}
                      />
                      <span
                        className={cn(
                          "text-[8px] font-mono leading-tight text-center hidden lg:block transition-colors duration-500",
                          isPast && "text-success/80",
                          isActive && !isError && "text-primary",
                          isActive && isError && "text-destructive-foreground",
                          isFuture && "text-muted-foreground/30"
                        )}
                      >
                        {STATUS_LABELS[step]}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="text-[10px] font-mono px-2 py-1"
                  >
                    {STATUS_LABELS[step]}
                    {isPast && " (done)"}
                    {isActive && !isError && " (current)"}
                    {isActive && isError && " (failed)"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Connector line */}
              {i < displaySteps.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-0.5 transition-all duration-700",
                    isPast ? "bg-success/60" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {isError && error && (
        <div className="mt-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-[11px] font-mono text-destructive-foreground leading-relaxed">
          {error}
        </div>
      )}
    </div>
  );
}
