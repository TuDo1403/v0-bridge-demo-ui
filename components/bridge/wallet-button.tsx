"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAINS } from "@/config/chains";
import { ChainIcon } from "./chain-icon";
import { Wallet, LogOut, Copy, Check } from "lucide-react";
import { useState } from "react";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const chainMeta = chainId ? CHAINS[chainId] : null;

  if (!isConnected) {
    return (
      <Button
        onClick={() => connect({ connector: connectors[0] })}
        className="bg-primary text-primary-foreground font-mono text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
      >
        <Wallet className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </Button>
    );
  }

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="font-mono text-xs sm:text-sm gap-1.5 sm:gap-2 px-2.5 sm:px-3 h-8 sm:h-9">
          <span className="h-2 w-2 rounded-full bg-success shrink-0" />
          {truncateAddress(address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopy} className="font-mono text-xs gap-2">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy Address"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="text-destructive-foreground gap-2"
        >
          <LogOut className="h-3 w-3" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
