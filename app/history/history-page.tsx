"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAccount } from "wagmi";
import { PageShell } from "@/components/bridge/page-shell";
import { fetchHistory } from "@/lib/bridge-service";
import type { BridgeStatusResponse } from "@/lib/types";
import { formatUnits } from "viem";
import { CHAINS, LZ_SCAN_BASE } from "@/config/chains";
import { TOKENS } from "@/config/contracts";
import { TxBadge } from "@/components/bridge/tx-badge";

/** Resolve decimals from a token contract address */
function resolveTokenDecimals(tokenAddr: string): number {
  const lower = tokenAddr.toLowerCase();
  for (const t of Object.values(TOKENS)) {
    for (const addr of Object.values(t.addresses)) {
      if (addr.toLowerCase() === lower) return t.decimals;
    }
  }
  return 6;
}

function resolveTokenSymbol(tokenAddr: string): string {
  const lower = tokenAddr.toLowerCase();
  for (const t of Object.values(TOKENS)) {
    for (const addr of Object.values(t.addresses)) {
      if (addr.toLowerCase() === lower) return t.symbol;
    }
  }
  return "USDC";
}

/** Format a raw amount string with proper decimals */
function fmtAmt(raw: string | null | undefined, decimals: number): string {
  if (!raw) return "--";
  try {
    const n = Number(formatUnits(BigInt(raw), decimals));
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals });
  } catch {
    return raw;
  }
}
import { ChainIcon, TokenIcon } from "@/components/bridge/chain-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
  RefreshCw,
  Wallet,
  Copy,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type FilterTab = "all" | "active" | "completed" | "failed";

function isJobFailed(job: BridgeStatusResponse): boolean {
  const cs = job.composeStatus?.toLowerCase() ?? "";
  return (
    job.status === "failed" ||
    cs.includes("fail") ||
    cs.includes("revert")
  );
}

function isJobActive(job: BridgeStatusResponse): boolean {
  return !isJobFailed(job) && job.status !== "completed";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ job }: { job: BridgeStatusResponse }) {
  const failed = isJobFailed(job);
  const composeFailed =
    job.composeStatus?.toLowerCase().includes("fail") ||
    job.composeStatus?.toLowerCase().includes("revert");
  const completed = job.status === "completed" && !failed;

  if (failed) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-destructive/15 text-destructive-foreground">
        <XCircle className="h-3 w-3" />
        {composeFailed ? "Compose Failed" : "Failed"}
      </span>
    );
  }
  if (completed) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-success/15 text-success">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary">
      <Loader2 className="h-3 w-3 animate-spin" />
      {job.status.replace(/_/g, " ")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Job card                                                           */
/* ------------------------------------------------------------------ */

function JobCard({ job }: { job: BridgeStatusResponse }) {
  const router = useRouter();
  const srcChain = Object.values(CHAINS).find((c) => c.chainId === job.sourceChainId);
  const dstChain = Object.values(CHAINS).find((c) => c.chainId === job.dstChainId);
  const decimals = resolveTokenDecimals(job.token);
  const symbol = resolveTokenSymbol(job.token);
  const failed = isJobFailed(job);
  const completed = job.status === "completed" && !failed;

  const trackUrl = job.lzMessageId
    ? `/track/guid/${job.lzMessageId}`
    : job.backendProcessTxHash
      ? `/track/tx/${job.backendProcessTxHash}`
      : job.userTransferTxHash
        ? `/track/tx/${job.userTransferTxHash}`
        : null;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 p-4 rounded-lg border transition-colors",
        failed
          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
          : completed
            ? "border-success/20 bg-success/5 hover:bg-success/10"
            : "border-border bg-card hover:bg-muted/30"
      )}
    >
      {/* Top row: route + amount + status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {srcChain && (
              <>
                <ChainIcon chainKey={srcChain.iconKey} className="h-4 w-4" />
                <span className="text-foreground">{srcChain.shortLabel}</span>
              </>
            )}
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            {dstChain && (
              <>
                <ChainIcon chainKey={dstChain.iconKey} className="h-4 w-4" />
                <span className="text-foreground">{dstChain.shortLabel}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <TokenIcon tokenKey="usdc" className="h-3.5 w-3.5" />
                <span className="text-xs font-mono font-medium text-foreground">
                  {fmtAmt(job.amount, decimals)} {symbol}
                </span>
          </div>
        </div>

        <StatusBadge job={job} />
      </div>

      {/* Amount breakdown */}
      {(job.feeAmount || job.netAmount) && (
        <div className="flex items-center gap-4 px-2 py-1.5 rounded bg-muted/20 border border-border/30 text-[10px] font-mono">
          <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Sent</span>
                  <span className="text-foreground">{fmtAmt(job.amount, decimals)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Fee</span>
                  <span className="text-chart-4">{fmtAmt(job.feeAmount, decimals)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground/60 uppercase tracking-wider text-[8px]">Net Received</span>
                  <span className="text-success">{fmtAmt(job.netAmount, decimals)}</span>
          </div>
        </div>
      )}

      {/* Transaction hashes */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {job.userTransferTxHash && (
          <TxBadge
            label="User Tx"
            hash={job.userTransferTxHash}
            explorerUrl={srcChain?.explorerTxUrl(job.userTransferTxHash)}
          />
        )}
        {job.backendProcessTxHash && (
          <TxBadge
            label="Backend"
            hash={job.backendProcessTxHash}
            explorerUrl={srcChain?.explorerTxUrl(job.backendProcessTxHash)}
          />
        )}
        {job.lzMessageId && (
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="text-muted-foreground/60">LZ Msg</span>
            <span className="text-foreground truncate max-w-[100px]">
              {job.lzMessageId.slice(0, 8)}...{job.lzMessageId.slice(-6)}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(job.lzMessageId!)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
        {job.destinationTxHash && (
          <TxBadge
            label="Dest"
            hash={job.destinationTxHash}
            explorerUrl={dstChain?.explorerTxUrl(job.destinationTxHash)}
          />
        )}
        {job.composeTxHash && (
          <TxBadge
            label="Compose"
            hash={job.composeTxHash}
            explorerUrl={dstChain?.explorerTxUrl(job.composeTxHash)}
          />
        )}
      </div>

      {/* Compose status */}
      {job.composeStatus && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground/60">Compose:</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded",
              isJobFailed(job) && "bg-destructive/10 text-destructive-foreground",
              !isJobFailed(job) && job.composeStatus.toLowerCase().includes("execut") && "bg-success/10 text-success",
              !isJobFailed(job) && !job.composeStatus.toLowerCase().includes("execut") && "bg-muted/50 text-muted-foreground",
            )}
          >
            {job.composeStatus}
          </span>
        </div>
      )}

      {/* Error message */}
      {job.error && (
        <div className="text-[10px] font-mono text-destructive-foreground bg-destructive/10 rounded px-2 py-1.5 break-all">
          {job.error}
        </div>
      )}

      {/* Bottom row: timestamps + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
          <span>{formatDate(job.createdAt)}</span>
          <span>{getTimeAgo(job.createdAt)}</span>
          <span className="truncate max-w-[100px]" title={job.jobId}>
            {job.jobId.slice(0, 8)}...
          </span>
        </div>

        <div className="flex items-center gap-2">
          {trackUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] font-mono gap-1"
              onClick={() => router.push(trackUrl)}
            >
              <Search className="h-3 w-3" />
              Track
            </Button>
          )}
          {job.lzMessageId && (
            <a
              href={`${LZ_SCAN_BASE}/tx/${job.lzMessageId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
            >
              LZ Scan
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main history page                                                  */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

export function HistoryPage() {
  const { address, isConnected } = useAccount();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [page, setPage] = useState(0);

  const {
    data: jobs,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(
    isConnected && address ? ["bridge-history", address, page] : null,
    () => fetchHistory(address!, PAGE_SIZE, page * PAGE_SIZE),
    { refreshInterval: 15000, revalidateOnFocus: true }
  );

  const filtered = useMemo(() => {
    if (!jobs) return [];
    switch (filter) {
      case "active":
        return jobs.filter((j) => isJobActive(j));
      case "completed":
        return jobs.filter((j) => j.status === "completed" && !isJobFailed(j));
      case "failed":
        return jobs.filter((j) => isJobFailed(j));
      default:
        return jobs;
    }
  }, [jobs, filter]);

  const counts = useMemo(() => {
    if (!jobs) return { all: 0, active: 0, completed: 0, failed: 0 };
    return {
      all: jobs.length,
      active: jobs.filter((j) => isJobActive(j)).length,
      completed: jobs.filter((j) => j.status === "completed" && !isJobFailed(j)).length,
      failed: jobs.filter((j) => isJobFailed(j)).length,
    };
  }, [jobs]);

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "failed", label: "Failed" },
  ];

  /* Not connected state */
  if (!isConnected) {
    return (
      <PageShell>
        <div className="p-4 sm:p-5 rounded-lg border border-border bg-card">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Wallet className="h-8 w-8 text-muted-foreground/30" />
            <span className="text-xs font-mono text-center">
              Connect your wallet to view bridge history
            </span>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="p-4 sm:p-5 rounded-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Bridge History
          </span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
          <button
            onClick={() => mutate()}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-muted/20 border border-border/50 w-fit">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setFilter(key); setPage(0); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors",
                filter === key
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {label}
              {counts[key] > 0 && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full",
                  filter === key ? "bg-primary/20" : "bg-muted/50"
                )}>
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Loading history...</span>
          </div>
        )}

        {/* Error */}
        {fetchError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-destructive-foreground">
            <XCircle className="h-6 w-6 text-destructive-foreground/50" />
            <span className="text-xs font-mono text-center">
              {fetchError.message ?? "Failed to load history"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 font-mono text-xs"
              onClick={() => mutate()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !fetchError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Clock className="h-6 w-6 text-muted-foreground/30" />
            <span className="text-xs font-mono">
              {filter === "all"
                ? "No bridge transactions found"
                : `No ${filter} transactions`}
            </span>
            {filter === "all" && (
              <Link href="/bridge">
                <Button variant="outline" size="sm" className="mt-2 font-mono text-xs">
                  Start a Bridge
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Job list */}
        {!isLoading && !fetchError && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && jobs && jobs.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground">
              Page {page + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={jobs.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
