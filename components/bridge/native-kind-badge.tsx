"use client";

import { cn } from "@/lib/utils";
import type { BridgeKind } from "@/lib/types";
import { Zap, Anchor } from "lucide-react";

interface NativeKindBadgeProps {
  kind: BridgeKind;
  className?: string;
  /** When true the icon is omitted and only the text label is shown. */
  textOnly?: boolean;
}

/**
 * Small inline badge for history rows that distinguishes a LayerZero OFT
 * transfer from an OP Stack native portal transfer at a glance. Same visual
 * weight as the existing <TxBadge> components so it slots into <HistoryItemCard>
 * without redesign.
 */
export function NativeKindBadge({ kind, className, textOnly = false }: NativeKindBadgeProps) {
  const label = kind === "native" ? "OP Native" : "LZ";
  const Icon = kind === "native" ? Anchor : Zap;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border",
        kind === "native"
          ? "border-chart-2/30 text-chart-2 bg-chart-2/10"
          : "border-border/50 text-muted-foreground bg-muted/30",
        className,
      )}
    >
      {!textOnly && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}
