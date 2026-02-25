"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TxBadge } from "./tx-badge";
import { ChainIcon } from "./chain-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { normalizeLzStatus, type LzTrackingData } from "@/lib/layerzero";
import { CHAINS, LZ_SCAN_BASE } from "@/config/chains";
import {
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Radio,
  Layers,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Parse raw API message into our LzTrackingData shape                */
/* ------------------------------------------------------------------ */

function parseApiMessage(msg: Record<string, unknown>): LzTrackingData {
  const pathway = msg?.pathway as Record<string, unknown> | undefined;
  const srcChain = (pathway?.srcChain ?? msg?.srcChainId) as number | undefined;
  const dstChain = (pathway?.dstChain ?? msg?.dstChainId) as number | undefined;

  // Compose
  let composeStatus = "UNKNOWN";
  let composeTx: string | undefined;
  const lzCompose = (pathway?.lzCompose ?? msg?.lzCompose) as Record<string, unknown> | undefined;
  if (lzCompose) {
    composeStatus = ((lzCompose.status as string) ?? "UNKNOWN").toUpperCase();
    composeTx = lzCompose.txHash as string | undefined;
  }
  if (msg?.lzComposeStatus) {
    composeStatus = (msg.lzComposeStatus as string).toUpperCase();
    composeTx = (msg.lzComposeTxHash as string) ?? composeTx;
  }

  return {
    status: normalizeLzStatus(msg?.status as string),
    guid: (msg?.guid as string) ?? undefined,
    srcTxHash: (msg?.srcTxHash ?? msg?.srcUaTxHash) as string | undefined,
    srcChainId: srcChain,
    srcEid: (msg?.srcEid ?? (pathway?.sender as Record<string, unknown>)?.eid) as number | undefined,
    srcUaAddress: (msg?.srcUaAddress ?? (pathway?.sender as Record<string, unknown>)?.address) as string | undefined,
    dstTxHash: (msg?.dstTxHash ?? msg?.dstUaTxHash) as string | undefined,
    dstChainId: dstChain,
    dstEid: (msg?.dstEid ?? (pathway?.receiver as Record<string, unknown>)?.eid) as number | undefined,
    dstUaAddress: (msg?.dstUaAddress ?? (pathway?.receiver as Record<string, unknown>)?.address) as string | undefined,
    sender: (msg?.sender ?? msg?.srcUaAddress) as string | undefined,
    receiver: (msg?.receiver ?? msg?.dstUaAddress) as string | undefined,
    compose: { status: composeStatus as "SUCCEEDED" | "FAILED" | "NOT_EXECUTED" | "UNKNOWN", txHash: composeTx },
    rawStatus: (msg?.status as string) ?? undefined,
    created: (msg?.created as number) ?? undefined,
    updated: (msg?.updated as number) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Phase helpers (mirrors tracking-card logic)                        */
/* ------------------------------------------------------------------ */

type Phase = "indexing" | "inflight" | "delivered" | "complete" | "failed";

function derivePhase(d: LzTrackingData): Phase {
  if (d.status === "lz_failed" || d.status === "lz_blocked") return "failed";
  if (d.status === "lz_delivered") {
    if (d.compose?.status === "SUCCEEDED") return "complete";
    if (d.compose?.status === "FAILED") return "failed";
    return "delivered";
  }
  if (d.status === "lz_inflight") return "inflight";
  return "indexing";
}

const PHASE_META: Record<Phase, { label: string; color: string; icon: React.ReactNode }> = {
  indexing:   { label: "Confirming",  color: "text-chart-4",              icon: <Radio className="h-4 w-4 animate-pulse" /> },
  inflight:   { label: "In Flight",   color: "text-primary",              icon: <Zap className="h-4 w-4 animate-pulse" /> },
  delivered:  { label: "Delivered",    color: "text-primary",              icon: <Layers className="h-4 w-4" /> },
  complete:   { label: "Complete",     color: "text-success",              icon: <CheckCircle2 className="h-4 w-4" /> },
  failed:     { label: "Failed",       color: "text-destructive-foreground", icon: <XCircle className="h-4 w-4" /> },
};

const PHASE_STEPS: Phase[] = ["indexing", "inflight", "delivered", "complete"];

function PhaseBar({ phase }: { phase: Phase }) {
  const idx = phase === "failed" ? -1 : PHASE_STEPS.indexOf(phase);
  return (
    <div className="flex items-center gap-0.5 w-full">
      {PHASE_STEPS.map((p, i) => {
        const isPast = idx >= 0 && i < idx;
        const isActive = i === idx;
        const isFailed = phase === "failed";
        return (
          <TooltipProvider key={p} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-700",
                      isPast && "bg-success",
                      isActive && !isFailed && "bg-primary animate-pulse",
                      isActive && isFailed && "bg-destructive",
                      !isPast && !isActive && "bg-muted",
                      isFailed && !isActive && "bg-muted",
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[10px] font-mono">
                {PHASE_META[p].label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Address pill                                                       */
/* ------------------------------------------------------------------ */

function Addr({ label, address }: { label: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-[11px] text-foreground truncate">
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
      <button
        onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resolve EID -> ChainMeta for display                               */
/* ------------------------------------------------------------------ */

function chainByEid(eid?: number) {
  if (!eid) return undefined;
  return Object.values(CHAINS).find((c) => c.lzEid === eid);
}

/* ------------------------------------------------------------------ */
/*  Result card (standalone -- no BridgeSession needed)                */
/* ------------------------------------------------------------------ */

function LzResultCard({
  data,
  onClose,
}: {
  data: LzTrackingData;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const phase = derivePhase(data);
  const meta = PHASE_META[phase];
  const isTerminal = phase === "complete" || phase === "failed";

  const srcChain = chainByEid(data.srcEid);
  const dstChain = chainByEid(data.dstEid);

  const borderClass = cn(
    "rounded-lg border transition-all duration-500",
    phase === "complete" && "border-success/40 bg-success/5",
    phase === "failed" && "border-destructive/40 bg-destructive/5",
    !isTerminal && "border-primary/30 bg-primary/5",
  );

  return (
    <div className={borderClass}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={cn("shrink-0", meta.color)}>{meta.icon}</div>

        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-mono font-medium", meta.color)}>
              {meta.label}
            </span>
            {data.rawStatus && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                {data.rawStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground flex-wrap">
            {srcChain && (
              <>
                <ChainIcon chainKey={srcChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{srcChain.shortLabel}</span>
              </>
            )}
            {data.srcEid && <span className="text-muted-foreground/40">(EID {data.srcEid})</span>}
            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
            {dstChain && (
              <>
                <ChainIcon chainKey={dstChain.iconKey} className="h-3 w-3 shrink-0" />
                <span>{dstChain.shortLabel}</span>
              </>
            )}
            {data.dstEid && <span className="text-muted-foreground/40">(EID {data.dstEid})</span>}
          </div>
        </div>

        {/* LZ Scan link */}
        {data.srcTxHash && (
          <a
            href={`${LZ_SCAN_BASE}/tx/${data.srcTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono text-primary hover:text-primary/80 bg-primary/10 transition-colors"
          >
            LZ Scan
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Dismiss result"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <PhaseBar phase={phase} />
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border/50 pt-3">
          {/* GUID */}
          {data.guid && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">GUID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-foreground break-all">{data.guid}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(data.guid!)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          )}

          {/* Transaction hashes */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Transactions</span>
            <TxBadge
              label="Source Tx"
              hash={data.srcTxHash}
              explorerUrl={data.srcTxHash && srcChain ? srcChain.explorerTxUrl(data.srcTxHash) : undefined}
            />
            <TxBadge
              label="Dest Tx"
              hash={data.dstTxHash}
              explorerUrl={data.dstTxHash && dstChain ? dstChain.explorerTxUrl(data.dstTxHash) : undefined}
            />
          </div>

          {/* Compose */}
          {data.compose && data.compose.status !== "UNKNOWN" && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Compose</span>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  data.compose.status === "SUCCEEDED" && "bg-success/10 text-success",
                  data.compose.status === "FAILED" && "bg-destructive/10 text-destructive-foreground",
                  data.compose.status !== "SUCCEEDED" && data.compose.status !== "FAILED" && "bg-muted/50 text-muted-foreground",
                )}
              >
                {data.compose.status}
              </span>
            </div>
          )}

          {/* Addresses */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              {srcChain && (
                <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  <ChainIcon chainKey={srcChain.iconKey} className="h-3 w-3" />
                  Source
                </span>
              )}
              <Addr label="Sender" address={data.sender ?? data.srcUaAddress} />
            </div>
            <div className="flex flex-col gap-1">
              {dstChain && (
                <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  <ChainIcon chainKey={dstChain.iconKey} className="h-3 w-3" />
                  Destination
                </span>
              )}
              <Addr label="Receiver" address={data.receiver ?? data.dstUaAddress} />
            </div>
          </div>

          {/* Timestamps */}
          {(data.created || data.updated) && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              {data.created && <span>Created: {new Date(data.created).toLocaleString()}</span>}
              {data.updated && <span>Updated: {new Date(data.updated).toLocaleString()}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TxSearch – the search bar + result display                         */
/* ------------------------------------------------------------------ */

export function TxSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LzTrackingData | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const doLookup = useCallback(async (hash: string) => {
    if (!hash.trim()) return;
    setError(null);

    try {
      const res = await fetch(`/api/lz/lookup?hash=${encodeURIComponent(hash.trim())}`);
      if (res.status === 404) {
        setError("No LayerZero message found for this hash. It may not be indexed yet.");
        setResult(null);
        return null;
      }
      if (!res.ok) {
        setError(`API error (${res.status})`);
        setResult(null);
        return null;
      }
      const body = await res.json();
      const messages = body?.messages;
      if (!messages || messages.length === 0) {
        setError("No LayerZero message found for this hash.");
        setResult(null);
        return null;
      }
      const parsed = parseApiMessage(messages[0]);
      setResult(parsed);
      return parsed;
    } catch {
      setError("Network error. Please try again.");
      setResult(null);
      return null;
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPollingActive(false);

    const data = await doLookup(query);
    setLoading(false);

    // If the message is not terminal, start auto-refresh polling
    if (data && data.status !== "lz_delivered" && data.status !== "lz_failed") {
      setPollingActive(true);
      pollRef.current = setInterval(async () => {
        const updated = await doLookup(query);
        if (updated && (updated.status === "lz_delivered" || updated.status === "lz_failed")) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPollingActive(false);
        }
      }, 6000);
    }
  }, [query, doLookup]);

  const handleClose = useCallback(() => {
    setResult(null);
    setError(null);
    setQuery("");
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPollingActive(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search tx hash or GUID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 font-mono text-xs bg-muted/30 border-border h-9"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          size="sm"
          className="h-9 px-3 font-mono text-xs gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Track
        </Button>
      </div>

      {/* Polling indicator */}
      {pollingActive && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Auto-refreshing every 6s...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/30 border border-border text-xs font-mono text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{error}</span>
        </div>
      )}

      {/* Result card */}
      {result && <LzResultCard data={result} onClose={handleClose} />}
    </div>
  );
}
