"use client";

import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export interface RateLimitSummary {
  label: string;
  availableLabel?: string;
  capacityLabel?: string;
  enabled: boolean;
  low?: boolean;
}

interface FeeSummaryProps {
  feeBps: number;
  feeExempt: boolean;
  amount: string;
  tokenSymbol: string;
  direction: "deposit" | "withdraw";
  /** Whether this lane is paused */
  lanePaused?: boolean;
  /** 0 = Percentage, 1 = Flat (from on-chain getTokenFeeConfig) */
  feeMode: number;
  /** Flat fee in token decimals (from on-chain getTokenFeeConfig) */
  flatFee: bigint;
  /** Token decimals for formatting */
  tokenDecimals: number;
  /** On-chain protocol fee from quote() — authoritative */
  protocolFee?: bigint;
  /** Current route rate-limit buckets, already formatted in their native units */
  rateLimits?: RateLimitSummary[];
}

export function FeeSummary({
  feeBps,
  feeExempt,
  amount,
  tokenSymbol,
  direction,
  lanePaused,
  feeMode,
  flatFee,
  tokenDecimals,
  protocolFee,
  rateLimits = [],
}: FeeSummaryProps) {
  const parsedAmount = parseFloat(amount) || 0;

  // Compute fee amount: prefer on-chain protocolFee, then local estimate
  let feeAmount: number;
  if (feeExempt) {
    feeAmount = 0;
  } else if (protocolFee !== undefined) {
    feeAmount = Number(protocolFee) / (10 ** tokenDecimals);
  } else if (feeMode === 1) {
    feeAmount = Number(flatFee) / (10 ** tokenDecimals);
  } else {
    feeAmount = parsedAmount * (feeBps / 10000);
  }

  const netAmount = Math.max(0, parsedAmount - feeAmount);

  // Fee label
  const feeLabel = feeMode === 1 ? "Flat Fee" : `Bridge Fee (${(feeBps / 100).toFixed(2)}%)`;

  if (parsedAmount <= 0) return null;

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/20">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
        Summary
      </span>
      <div className="flex flex-col gap-1.5">
        {/* Direction */}
        <Row
          label={direction === "deposit" ? "Deposit" : "Withdrawal"}
          value={`${parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${tokenSymbol}`}
        />

        {/* Fee */}
        <Row
          label={feeLabel}
          value={
            feeExempt ? (
              <span className="flex items-center gap-1 text-success">
                <Sparkles className="h-3 w-3" />
                Fee Exempt
              </span>
            ) : (
              `~${feeAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${tokenSymbol}`
            )
          }
        />

        {rateLimits.length > 0 && (
          <>
            <div className="h-px bg-border my-0.5" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
              Route Limits
            </span>
            {rateLimits.map((limit) => (
              <Row
                key={limit.label}
                label={limit.label}
                value={
                  limit.enabled && limit.availableLabel && limit.capacityLabel ? (
                    <span className={limit.low ? "text-warning" : undefined}>
                      {limit.availableLabel} / {limit.capacityLabel}
                    </span>
                  ) : (
                    "Not rate limited"
                  )
                }
              />
            ))}
          </>
        )}

        {/* Lane paused warning */}
        {lanePaused && (
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-destructive/10 border border-destructive/20 text-[10px] font-mono text-destructive-foreground mt-1">
            Lane is paused. Bridging unavailable.
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border my-0.5" />

        {/* Net */}
        <Row
          label="You Receive"
          value={`~${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${tokenSymbol}`}
          highlight
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs font-mono text-right",
          highlight ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
