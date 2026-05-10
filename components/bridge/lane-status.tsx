"use client";

import { CHAINS } from "@/config/chains";
import { ChainIcon } from "./chain-icon";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface RateLimitData {
  /** Available capacity in human-readable units (e.g. USDC with 6 decimals already formatted) */
  available: number;
  /** Total capacity */
  capacity: number;
  /** Token symbol */
  symbol: string;
  /** Short user-facing label for this limiter */
  label?: string;
}

export interface LaneInfo {
  sourceChainId: number;
  destChainId: number;
  active: boolean;
  paused: boolean;
  /** Structured rate limit data for visual display */
  rateLimit?: RateLimitData;
  /** All active route limiters, e.g. router USD + source outbound + destination inbound */
  rateLimits?: RateLimitData[];
}

function StatusDot({ active, paused }: { active: boolean; paused: boolean }) {
  if (paused) return <span className="h-1.5 w-1.5 rounded-full bg-destructive" />;
  if (active) return <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function RateLimitBar({ data }: { data: RateLimitData }) {
  const pct = data.capacity > 0 ? (data.available / data.capacity) * 100 : 0;
  const isLow = pct < 20;
  const isMedium = pct >= 20 && pct < 50;

  return (
    <div className="flex flex-col gap-1 mt-1.5">
      {/* Bar */}
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isLow
              ? "bg-destructive"
              : isMedium
                ? "bg-warning"
                : "bg-success"
          )}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-mono font-medium",
            isLow
              ? "text-destructive"
              : isMedium
                ? "text-warning"
                : "text-success"
          )}
        >
          {fmt(data.available)} {data.symbol}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/50">
          / {fmt(data.capacity)}
        </span>
      </div>
    </div>
  );
}

function LaneCard({ lane }: { lane: LaneInfo }) {
  const src = CHAINS[lane.sourceChainId];
  const dst = CHAINS[lane.destChainId];

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-2.5 py-2 rounded-md text-[11px] font-mono",
        lane.paused
          ? "bg-destructive/5 border border-destructive/20"
          : "bg-muted/30 border border-border/50"
      )}
    >
      {/* Route + status row */}
      <div className="flex items-center gap-2">
        <StatusDot active={lane.active} paused={lane.paused} />
        <div className="flex items-center gap-1">
          <ChainIcon chainKey={src?.iconKey} className="h-3 w-3" />
          <span className="text-muted-foreground">{src?.shortLabel ?? "?"}</span>
          <span className="text-muted-foreground/40 mx-0.5">&rarr;</span>
          <ChainIcon chainKey={dst?.iconKey} className="h-3 w-3" />
          <span className="text-muted-foreground">{dst?.shortLabel ?? "?"}</span>
        </div>
        <span
          className={cn(
            "ml-auto text-[10px]",
            lane.paused ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {lane.paused ? "Paused" : "Active"}
        </span>
      </div>

      {/* Rate limit bars (withdrawal lanes only) */}
      {!lane.paused && (lane.rateLimits?.length ? lane.rateLimits : lane.rateLimit ? [lane.rateLimit] : []).map((limit) => (
        <div key={`${limit.label ?? "limit"}-${limit.symbol}`} className="mt-1.5">
          {limit.label && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {limit.label}
            </span>
          )}
          <RateLimitBar data={limit} />
        </div>
      ))}
    </div>
  );
}

export function LaneStatusBar({ lanes, isLoading }: { lanes: LaneInfo[]; isLoading?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Lane Status
      </span>
      {isLoading ? (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/30 border border-border/50 text-[11px] font-mono text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching lane status...
        </div>
      ) : lanes.length === 0 ? (
        <div className="px-2.5 py-2 rounded-md bg-muted/30 border border-border/50 text-[11px] font-mono text-muted-foreground">
          No lanes configured
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {lanes.map((lane) => (
            <LaneCard key={`${lane.sourceChainId}-${lane.destChainId}`} lane={lane} />
          ))}
        </div>
      )}
    </div>
  );
}
