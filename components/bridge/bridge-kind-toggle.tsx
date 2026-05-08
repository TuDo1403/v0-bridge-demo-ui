"use client";

import { cn } from "@/lib/utils";
import type { BridgeKind } from "@/lib/types";
import { Zap, Anchor } from "lucide-react";

interface BridgeKindToggleProps {
  bridgeKind: BridgeKind;
  onBridgeKindChange: (kind: BridgeKind) => void;
  /** When false, the native option is rendered disabled (hover tooltip explains why). */
  nativeAvailable?: boolean;
  /** Reason tooltip shown on the native button when disabled. */
  nativeUnavailableReason?: string;
}

/**
 * Selects between LayerZero OFT (token-bridge, operator-relayed) and OP Stack
 * native (ETH-only via portal, BE prove+finalize relayer). Mirrors the visual
 * grammar of <BridgeModeToggle>: segmented two-cell pill with lucide icons.
 *
 * Native is gated by per-chain config — not every route supports it (e.g. a
 * Sepolia ↔ Base Sepolia LZ pair has no OP Stack portal). The parent computes
 * `nativeAvailable` from the selected source/dest chains.
 */
export function BridgeKindToggle({
  bridgeKind,
  onBridgeKindChange,
  nativeAvailable = true,
  nativeUnavailableReason = "OP Stack native bridge is not configured for this route.",
}: BridgeKindToggleProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Bridge Kind
      </span>
      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/50">
        <button
          type="button"
          onClick={() => onBridgeKindChange("lz")}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
            bridgeKind === "lz"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="h-3 w-3" />
          LayerZero
        </button>
        <button
          type="button"
          onClick={() => nativeAvailable && onBridgeKindChange("native")}
          disabled={!nativeAvailable}
          title={nativeAvailable ? undefined : nativeUnavailableReason}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
            bridgeKind === "native"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            !nativeAvailable && "opacity-40 cursor-not-allowed hover:text-muted-foreground",
          )}
        >
          <Anchor className="h-3 w-3" />
          OP Native
        </button>
      </div>
    </div>
  );
}
