"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { type Address, isAddress } from "viem";
import { PageShell } from "@/components/bridge/page-shell";
import { VaultDisplay, type VaultLookupContext } from "./vault-recover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDepositAddress } from "@/hooks/use-deposit-address";
import { CHAINS, chainIdToEid, getSupportedChainIds } from "@/config/chains";
import { KNOWN_DAPPS, getBridgeDirection } from "@/config/contracts";
import { useNetworkStore } from "@/lib/network-store";
import {
  Loader2,
  XCircle,
  Search,
  RotateCcw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  /recover — lookup vault by bridge parameters                        */
/* ------------------------------------------------------------------ */

export function RecoverLookup() {
  const { address: connectedAddress } = useAccount();
  const network = useNetworkStore((s) => s.network);
  const SUPPORTED_CHAIN_IDS = getSupportedChainIds(network);

  const [sourceChainId, setSourceChainId] = useState<number>(SUPPORTED_CHAIN_IDS[0]);
  const [destChainId, setDestChainId] = useState<number>(SUPPORTED_CHAIN_IDS[1] ?? SUPPORTED_CHAIN_IDS[0]);
  const [srcAddress, setSrcAddress] = useState("");
  const [dstAddress, setDstAddress] = useState("");
  const [dappId, setDappId] = useState(0);
  const [lookupTriggered, setLookupTriggered] = useState(false);

  const resolvedSrc = (srcAddress.trim() || connectedAddress || "") as string;
  const resolvedDst = (dstAddress.trim() || resolvedSrc) as string;
  const direction = getBridgeDirection(sourceChainId);
  const canLookup = isAddress(resolvedSrc) && isAddress(resolvedDst);

  const {
    depositAddress: vaultAddress,
    isLoading: isAddressLoading,
    isError: isAddressError,
  } = useDepositAddress({
    sourceChainId,
    destChainId,
    dappId: direction === "deposit" ? dappId : 0,
    address: lookupTriggered && isAddress(resolvedSrc) ? (resolvedSrc as Address) : undefined,
    recipientAddress: lookupTriggered && isAddress(resolvedDst) ? resolvedDst : undefined,
    direction,
  });

  const resetLookup = () => setLookupTriggered(false);

  const setField = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    resetLookup();
  };

  return (
    <PageShell>
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-mono font-bold text-foreground">Recover Tokens</h2>
          <p className="text-[11px] font-mono text-muted-foreground">
            Reconstruct a vault address from bridge parameters and recover stuck tokens.
            Only the vault owner (source address) can recover.
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4 px-4 py-4 rounded-lg border border-border/50 bg-muted/10">
          {/* Chain selectors */}
          <div className="flex items-center gap-3">
            <ChainSelect
              label="Source Chain"
              value={sourceChainId}
              onChange={setField(setSourceChainId)}
              chainIds={SUPPORTED_CHAIN_IDS}
            />
            <button
              onClick={() => { setSourceChainId(destChainId); setDestChainId(sourceChainId); resetLookup(); }}
              className="mt-4 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              title="Swap chains"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <ChainSelect
              label="Dest Chain"
              value={destChainId}
              onChange={setField(setDestChainId)}
              chainIds={SUPPORTED_CHAIN_IDS}
            />
          </div>

          {/* Source address */}
          <AddressInput
            label="Source Address (Vault Owner)"
            value={srcAddress}
            onChange={setField(setSrcAddress)}
            placeholder={connectedAddress ? `${connectedAddress.slice(0, 10)}... (connected)` : "0x..."}
            hint={connectedAddress && !srcAddress ? "Using connected wallet" : undefined}
          />

          {/* Destination address */}
          <AddressInput
            label="Destination Address (Recipient)"
            value={dstAddress}
            onChange={setField(setDstAddress)}
            placeholder={resolvedSrc ? `${resolvedSrc.slice(0, 10)}... (same as source)` : "0x..."}
            hint={!dstAddress ? "Defaults to source address" : undefined}
          />

          {/* Dapp selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Dapp ID {direction === "withdraw" && "(fixed: 0 for withdrawals)"}
            </label>
            <select
              value={dappId}
              onChange={(e) => setField(setDappId)(Number(e.target.value))}
              disabled={direction === "withdraw"}
              className={cn(
                "h-9 px-3 rounded-md border border-border bg-background text-[12px] font-mono text-foreground",
                direction === "withdraw" && "opacity-50"
              )}
            >
              {KNOWN_DAPPS.map((d) => (
                <option key={d.dappId} value={d.dappId}>
                  {d.label} (ID: {d.dappId})
                </option>
              ))}
            </select>
          </div>

          {/* Direction badge */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className={cn(
              "px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-medium",
              direction === "deposit" ? "bg-primary/10 text-primary" : "bg-chart-5/10 text-chart-5"
            )}>
              {direction}
            </span>
            <span>{CHAINS[sourceChainId]?.shortLabel} → {CHAINS[destChainId]?.shortLabel}</span>
          </div>

          {/* Action button */}
          {!lookupTriggered ? (
            <Button
              disabled={!canLookup}
              onClick={() => canLookup && setLookupTriggered(true)}
              className="font-mono text-xs gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              Lookup Vault
            </Button>
          ) : (
            <Button variant="outline" onClick={resetLookup} className="font-mono text-xs gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              New Lookup
            </Button>
          )}
        </div>

        {/* Results */}
        {lookupTriggered && (
          <div className="flex flex-col gap-4">
            {isAddressLoading && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border/50 bg-muted/20 text-[11px] font-mono text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Computing vault address...
              </div>
            )}

            {isAddressError && !vaultAddress && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-destructive/20 bg-destructive/5 text-[11px] font-mono text-destructive-foreground">
                <XCircle className="h-3.5 w-3.5" />
                Failed to compute vault address. Check your parameters.
              </div>
            )}

            {vaultAddress && (
              <VaultDisplay
                vaultAddress={vaultAddress}
                chainId={sourceChainId}
                lookup={
                  isAddress(resolvedSrc) && isAddress(resolvedDst)
                    ? ({
                        direction,
                        srcAddress: resolvedSrc as Address,
                        dstAddress: resolvedDst as Address,
                        dappId: direction === "deposit" ? dappId : undefined,
                        dstEid: direction === "withdraw" ? chainIdToEid(destChainId) : undefined,
                      } satisfies VaultLookupContext)
                    : undefined
                }
              />
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Small reusable form primitives (local to this file)                 */
/* ------------------------------------------------------------------ */

function ChainSelect({
  label,
  value,
  onChange,
  chainIds,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  chainIds: number[];
}) {
  return (
    <div className="flex flex-col gap-1 flex-1">
      <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 px-3 rounded-md border border-border bg-background text-[12px] font-mono text-foreground"
      >
        {chainIds.map((id) => (
          <option key={id} value={id}>{CHAINS[id]?.label}</option>
        ))}
      </select>
    </div>
  );
}

function AddressInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 px-3 rounded-md border bg-background text-[12px] font-mono text-foreground placeholder:text-muted-foreground/40",
          value && !isAddress(value) ? "border-destructive/50" : "border-border"
        )}
      />
      {hint && (
        <span className="text-[9px] font-mono text-muted-foreground/60">{hint}</span>
      )}
    </div>
  );
}
