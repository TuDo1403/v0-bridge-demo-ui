"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAccount } from "wagmi";
import { PageShell } from "@/components/bridge/page-shell";
import { fetchHistory, pollLzScan } from "@/lib/bridge-service";
import type { TxHashPair, HistoryResponse, LzTrackingSnapshot } from "@/lib/types";
import { CHAINS, getLzScanBase, eidToChainMeta } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";
import { TxBadge } from "@/components/bridge/tx-badge";
import { ChainIcon, TokenIcon } from "@/components/bridge/chain-icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Chain filter options                                                */
/* ------------------------------------------------------------------ */

const CHAIN_FILTER_OPTIONS = [
  { label: "All Chains", value: "all" },
  ...Object.values(CHAINS).map((c) => ({
    label: c.label,
    value: String(c.lzEid),
  })),
];

/* ------------------------------------------------------------------ */
/*  LZ enrichment helpers                                              */
/* ------------------------------------------------------------------ */

function formatTokenAmount(raw?: bigint): string | undefined {
  if (raw == null || raw === 0n) return undefined;
  const decimals = 6;
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fracStr.length === 0) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${fracStr}`;
}

function tryDecodeOftAmount(payload?: string): bigint | undefined {
  if (!payload) return undefined;
  try {
    const hex = payload.startsWith("0x") ? payload.slice(2) : payload;
    if (hex.length < 80) return undefined;
    const amountHex = hex.slice(64, 80);
    if (!amountHex || amountHex.length !== 16) return undefined;
    return BigInt("0x" + amountHex);
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  History item card                                                   */
/* ------------------------------------------------------------------ */

function HistoryItemCard({
  item,
  lzData,
}: {
  item: TxHashPair;
  lzData?: LzTrackingSnapshot | null;
}) {
  const router = useRouter();
  const network = useNetworkStore((s) => s.network);
  const LZ_SCAN_BASE = getLzScanBase(network);

  const srcChain = lzData?.srcEid ? eidToChainMeta(lzData.srcEid) : undefined;
  const dstChain = lzData?.dstEid ? eidToChainMeta(lzData.dstEid) : undefined;

  // Derive status
  const lzStatus = lzData?.lzStatus;
  const isDelivered = lzStatus === "lz_delivered";
  const isFailed = lzStatus === "lz_failed";
  const isPending = !lzData || (!isDelivered && !isFailed);

  const trackUrl = `/track/tx/${item.bridge_tx_hash}`;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2.5 p-4 rounded-lg border transition-colors",
        isFailed
          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
          : isDelivered
            ? "border-success/20 bg-success/5 hover:bg-success/10"
            : "border-border bg-card hover:bg-muted/30"
      )}
    >
      {/* Top row: route + status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {srcChain ? (
              <>
                <ChainIcon chainKey={srcChain.iconKey} className="h-4 w-4" />
                <span className="text-foreground">{srcChain.shortLabel}</span>
              </>
            ) : (
              <span className="text-muted-foreground">?</span>
            )}
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            {dstChain ? (
              <>
                <ChainIcon chainKey={dstChain.iconKey} className="h-4 w-4" />
                <span className="text-foreground">{dstChain.shortLabel}</span>
              </>
            ) : (
              <span className="text-muted-foreground">?</span>
            )}
          </div>
          {lzData && (
            <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-foreground">
              <TokenIcon tokenKey="usdc" className="h-3.5 w-3.5" />
              {(() => {
                // Try to decode amount from LZ payload — not available via pollLzScan snapshot,
                // so just show raw status label for now
                return lzData.rawStatus ?? "";
              })()}
            </span>
          )}
        </div>

        {/* Status badge */}
        {isFailed ? (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-destructive/15 text-destructive-foreground">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        ) : isDelivered ? (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-success/15 text-success">
            <CheckCircle2 className="h-3 w-3" />
            Delivered
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            {lzData ? (lzData.lzStatus?.replace("lz_", "") ?? "pending") : "Pending"}
          </span>
        )}
      </div>

      {/* Transaction hashes */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {item.vault_fund_tx_hash && (
          <TxBadge
            label="Vault Fund"
            hash={item.vault_fund_tx_hash}
            explorerUrl={srcChain?.explorerTxUrl(item.vault_fund_tx_hash)}
          />
        )}
        <TxBadge
          label="Bridge Tx"
          hash={item.bridge_tx_hash}
          explorerUrl={srcChain?.explorerTxUrl(item.bridge_tx_hash)}
        />
        {lzData?.dstTxHash && (
          <TxBadge
            label="Dest Tx"
            hash={lzData.dstTxHash}
            explorerUrl={dstChain?.explorerTxUrl(lzData.dstTxHash)}
          />
        )}
      </div>

      {/* Compose status */}
      {lzData?.composeStatus && lzData.composeStatus !== "UNKNOWN" && lzData.composeStatus !== "NOT_EXECUTED" && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground/60">Compose:</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded",
              lzData.composeStatus === "FAILED" && "bg-destructive/10 text-destructive-foreground",
              lzData.composeStatus === "SUCCEEDED" && "bg-success/10 text-success",
              lzData.composeStatus !== "FAILED" && lzData.composeStatus !== "SUCCEEDED" && "bg-muted/50 text-muted-foreground",
            )}
          >
            {lzData.composeStatus}
          </span>
        </div>
      )}

      {/* Bottom row: actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] font-mono gap-1"
          onClick={() => router.push(trackUrl)}
        >
          <Search className="h-3 w-3" />
          Track
        </Button>
        <a
          href={`${LZ_SCAN_BASE}/tx/${item.bridge_tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
        >
          LZ Scan
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main history page                                                  */
/* ------------------------------------------------------------------ */

const PAGE_SIZES = [5, 10, 20];

export function HistoryPage({ addressParam }: { addressParam?: string } = {}) {
  const router = useRouter();
  const { address: walletAddress } = useAccount();
  const network = useNetworkStore((s) => s.network);
  const LZ_SCAN_BASE = getLzScanBase(network);

  const address = addressParam ?? walletAddress;

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [srcEidFilter, setSrcEidFilter] = useState<string>("all");
  const [dstEidFilter, setDstEidFilter] = useState<string>("all");

  // LZ enrichment cache: bridge_tx_hash -> LzTrackingSnapshot
  const [lzCache, setLzCache] = useState<Record<string, LzTrackingSnapshot | null>>({});

  // When wallet connects on /history (no param), redirect to /history/{address}
  useEffect(() => {
    if (walletAddress && !addressParam) {
      router.replace(`/history/${walletAddress}`, { scroll: false });
    }
  }, [walletAddress, addressParam, router]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [srcEidFilter, dstEidFilter, pageSize]);

  const srcEid = srcEidFilter !== "all" ? Number(srcEidFilter) : undefined;
  const dstEid = dstEidFilter !== "all" ? Number(dstEidFilter) : undefined;

  const {
    data: historyData,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<HistoryResponse>(
    address ? ["bridge-history", address, page, pageSize, srcEidFilter, dstEidFilter] : null,
    () => fetchHistory(address!, pageSize, page * pageSize, srcEid, dstEid, network),
    { refreshInterval: 15000, revalidateOnFocus: true }
  );

  const items = historyData?.items ?? [];
  const total = historyData?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  // Enrich items with LZ Scan data (batched to avoid render thrashing)
  const enrichItems = useCallback(async (txItems: TxHashPair[]) => {
    const toFetch = txItems.filter((item) => lzCache[item.bridge_tx_hash] === undefined);
    if (toFetch.length === 0) return;

    // Batch-mark all as loading in a single state update
    setLzCache((prev) => {
      const next = { ...prev };
      for (const item of toFetch) next[item.bridge_tx_hash] = null;
      return next;
    });

    // Fetch all in parallel, then batch-update results
    const results = await Promise.allSettled(
      toFetch.map((item) => pollLzScan(item.bridge_tx_hash, network).then((snapshot) => ({ hash: item.bridge_tx_hash, snapshot })))
    );

    setLzCache((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === "fulfilled") next[r.value.hash] = r.value.snapshot;
      }
      return next;
    });
  }, [lzCache]);

  useEffect(() => {
    if (items.length > 0) {
      enrichItems(items);
    }
  }, [items, enrichItems]);

  /* No address available -- show connect prompt */
  if (!address) {
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

        {/* Chain filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">Source</span>
            <Select value={srcEidFilter} onValueChange={setSrcEidFilter}>
              <SelectTrigger className="h-7 w-[130px] text-xs font-mono bg-muted/30 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAIN_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">Dest</span>
            <Select value={dstEidFilter} onValueChange={setDstEidFilter}>
              <SelectTrigger className="h-7 w-[130px] text-xs font-mono bg-muted/30 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAIN_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Per-page selector */}
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] font-mono text-muted-foreground/60">Per page</span>
            <div className="flex items-center gap-0.5">
              {PAGE_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
                    pageSize === size
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
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
        {!isLoading && !fetchError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Clock className="h-6 w-6 text-muted-foreground/30" />
            <span className="text-xs font-mono">No bridge transactions found</span>
            <Link href="/bridge">
              <Button variant="outline" size="sm" className="mt-2 font-mono text-xs">
                Start a Bridge
              </Button>
            </Link>
          </div>
        )}

        {/* Item list */}
        {!isLoading && !fetchError && items.length > 0 && (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <HistoryItemCard
                key={item.bridge_tx_hash}
                item={item}
                lzData={lzCache[item.bridge_tx_hash]}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && total > 0 && (
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
              Page {page + 1} of {maxPage + 1} ({total} total)
            </span>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={page >= maxPage}
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
