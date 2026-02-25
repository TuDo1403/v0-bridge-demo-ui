"use client";

import { WalletButton } from "./wallet-button";
import { ExternalLinksBar } from "./external-links";
import { useAccount } from "wagmi";
import { CHAINS } from "@/config/chains";

export function BridgeHeader() {
  const { chainId, isConnected } = useAccount();
  const chainMeta = chainId ? CHAINS[chainId] : null;

  return (
    <header className="flex flex-col gap-3 pb-4 border-b border-border">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-primary font-mono text-xs font-bold">R</span>
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-sm font-mono font-bold text-foreground tracking-tight truncate">
              RISE Global Deposit Bridge
            </h1>
            <span className="text-[10px] font-mono text-muted-foreground">
              Testnet
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isConnected && chainMeta && (
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {chainMeta.label}
            </span>
          )}
          <WalletButton />
        </div>
      </div>
      <ExternalLinksBar />
    </header>
  );
}
