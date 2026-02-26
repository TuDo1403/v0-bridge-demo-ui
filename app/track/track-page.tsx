"use client";

import { PageShell } from "@/components/bridge/page-shell";
import { TxSearch } from "@/components/bridge/tx-search";

export function TrackPage({
  initialHash,
  lookupType,
}: {
  initialHash?: string;
  lookupType?: "tx" | "guid";
}) {
  return (
    <PageShell>
      <div className="p-4 sm:p-5 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {lookupType === "guid" ? "Track by GUID" : lookupType === "tx" ? "Track by Tx Hash" : "Transaction Tracker"}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <TxSearch initialHash={initialHash} lookupType={lookupType} />
      </div>
    </PageShell>
  );
}
