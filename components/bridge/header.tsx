"use client";

import { WalletButton } from "./wallet-button";
import { useAccount } from "wagmi";
import { CHAINS } from "@/config/chains";
import { useBridgeStore } from "@/lib/bridge-store";

export function BridgeHeader() {
  const { chainId, isConnected } = useAccount();
  const activeSession = useBridgeStore((s) => s.activeSession);
  const chainMeta = chainId ? CHAINS[chainId] : null;

  return (
    <header className="flex items-center justify-between gap-4 pb-4 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-primary font-mono text-sm font-bold">R</span>
        </div>
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-mono font-bold text-foreground tracking-tight truncate">
            RISE Global Deposit Bridge
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">
              Testnet
            </span>
            {activeSession && (
              <>
                <span className="text-muted-foreground/30 text-[10px]">|</span>
                <span className="text-[10px] font-mono text-primary truncate max-w-[160px]">
                  Session: {activeSession.id.slice(0, 12)}...
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isConnected && chainMeta && (
          <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-[10px] font-mono text-muted-foreground border border-border/50">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            {chainMeta.label}
          </span>
        )}
        <WalletButton />
      </div>
    </header>
  );
}
