"use client";

import Link from "next/link";
import { WalletButton } from "./wallet-button";
import { NavTabs } from "./nav-tabs";
import { NetworkToggle } from "./network-toggle";
import { useAccount } from "wagmi";
import { CHAINS } from "@/config/chains";

export function BridgeHeader() {
  const { chainId, isConnected } = useAccount();
  const chainMeta = chainId ? CHAINS[chainId] : null;

  return (
    <header className="flex flex-col gap-3 pb-3 sm:pb-4 border-b border-border">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/bridge" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary font-mono text-xs sm:text-sm font-bold">R</span>
            </div>
            <h1 className="text-xs sm:text-sm font-mono font-bold text-foreground tracking-tight">
              RISE Bridge
            </h1>
          </Link>
          <NetworkToggle />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isConnected && chainMeta && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-[10px] font-mono text-muted-foreground border border-border/50">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              {chainMeta.label}
            </span>
          )}
          <WalletButton />
        </div>
      </div>

      <NavTabs />
    </header>
  );
}
