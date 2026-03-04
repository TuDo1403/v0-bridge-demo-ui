"use client";

import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import { PageShell } from "@/components/bridge/page-shell";
import { VaultDisplay } from "@/components/bridge/vault-recover";
import { riseVaultAbi } from "@/lib/abi";
import { SUPPORTED_CHAIN_IDS } from "@/config/chains";
import { Loader2, XCircle } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Auto-detect which chain the vault lives on                          */
/* ------------------------------------------------------------------ */

function useDetectVaultChain(vaultAddress: Address) {
  // Build a batched multicall across all supported chains
  const contracts = SUPPORTED_CHAIN_IDS.map((chainId) => ({
    address: vaultAddress,
    abi: riseVaultAbi,
    functionName: "getSrcAddress" as const,
    chainId,
  }));

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !!vaultAddress },
  });

  let detectedChainId: number | null = null;
  if (data) {
    for (let i = 0; i < SUPPORTED_CHAIN_IDS.length; i++) {
      const result = data[i];
      if (
        result?.status === "success" &&
        result.result &&
        result.result !== "0x0000000000000000000000000000000000000000"
      ) {
        detectedChainId = SUPPORTED_CHAIN_IDS[i];
        break;
      }
    }
  }

  return { detectedChainId, isLoading };
}

/* ------------------------------------------------------------------ */
/*  /recover/[address] — direct vault recovery by address               */
/* ------------------------------------------------------------------ */

export function RecoverPage({ vaultAddress }: { vaultAddress: string }) {
  const addr = vaultAddress as Address;
  const { detectedChainId, isLoading: detectingChain } = useDetectVaultChain(addr);

  return (
    <PageShell>
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-mono font-bold text-foreground">Recover Tokens</h2>
          <p className="text-[11px] font-mono text-muted-foreground">
            Recover tokens stuck in a deterministic vault clone.
            Only the vault owner (srcAddress) can call recovery.
          </p>
        </div>

        {detectingChain ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border/50 bg-muted/20 text-[11px] font-mono text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Detecting vault chain...
          </div>
        ) : detectedChainId === null ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-destructive/20 bg-destructive/5 text-[11px] font-mono text-destructive-foreground">
            <XCircle className="h-3.5 w-3.5" />
            No vault found at this address on any supported chain.
          </div>
        ) : (
          <VaultDisplay vaultAddress={addr} chainId={detectedChainId} />
        )}
      </div>
    </PageShell>
  );
}
