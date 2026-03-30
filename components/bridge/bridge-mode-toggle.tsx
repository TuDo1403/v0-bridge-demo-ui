"use client";

import { cn } from "@/lib/utils";
import type { BridgeMode, TransferMode } from "@/config/contracts";
import { Zap, Shield, FileSignature, ArrowRightLeft, Stamp } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Bridge Mode Toggle (Operator vs Self-bridge)                       */
/* ------------------------------------------------------------------ */

interface BridgeModeToggleProps {
  bridgeMode: BridgeMode;
  onBridgeModeChange: (mode: BridgeMode) => void;
  transferMode: TransferMode;
  onTransferModeChange: (mode: TransferMode) => void;
  /** Show transfer mode selector (only relevant for self-bridge) */
  showTransferMode: boolean;
  /** Whether the selected token supports EIP-2612 native permit */
  supportsEIP2612?: boolean;
}

export function BridgeModeToggle({
  bridgeMode,
  onBridgeModeChange,
  transferMode,
  onTransferModeChange,
  showTransferMode,
  supportsEIP2612 = false,
}: BridgeModeToggleProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Bridge mode: who pays gas */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Bridge Mode
        </span>
        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/50">
          <button
            type="button"
            onClick={() => onBridgeModeChange("operator")}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
              bridgeMode === "operator"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="h-3 w-3" />
            Operator
          </button>
          <button
            type="button"
            onClick={() => onBridgeModeChange("self")}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
              bridgeMode === "self"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Shield className="h-3 w-3" />
            Self Bridge
          </button>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60 px-0.5">
          {bridgeMode === "operator"
            ? "Backend handles bridging. You only transfer tokens."
            : "You send the bridge tx and pay LZ gas."}
        </span>
      </div>

      {/* Transfer mode: how tokens move (both modes) */}
      {showTransferMode && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Transfer Method
          </span>
          <div className={cn(
            "grid gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/50",
            supportsEIP2612 ? "grid-cols-3" : "grid-cols-2"
          )}>
            <button
              type="button"
              onClick={() => onTransferModeChange("vault")}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
                transferMode === "vault"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowRightLeft className="h-3 w-3" />
              Transfer
            </button>
            <button
              type="button"
              onClick={() => onTransferModeChange("permit2")}
              className={cn(
                "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
                transferMode === "permit2"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileSignature className="h-3 w-3" />
              Permit2
            </button>
            {supportsEIP2612 && (
              <button
                type="button"
                onClick={() => onTransferModeChange("eip2612")}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all",
                  transferMode === "eip2612"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Stamp className="h-3 w-3" />
                Permit
              </button>
            )}
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60 px-0.5">
            {({
              vault: {
                operator: "Transfer tokens to vault. Backend bridges for you.",
                self: "Transfer tokens to vault, then bridge (2 txs).",
              },
              permit2: {
                operator: "Sign a permit. Backend pulls tokens and bridges.",
                self: "Sign once, bridge in one tx. Requires Permit2 approval.",
              },
              eip2612: {
                operator: "Sign a token permit. No approval needed.",
                self: "Sign once, bridge in one tx. No approval needed.",
              },
            } as Record<string, Record<string, string>>)[transferMode]?.[bridgeMode] ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}
