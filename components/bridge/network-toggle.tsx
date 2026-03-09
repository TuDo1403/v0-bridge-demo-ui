"use client";

import { useState, useRef, useEffect } from "react";
import { useNetworkStore, type NetworkId } from "@/lib/network-store";
import { useBridgeStore } from "@/lib/bridge-store";
import { BRIDGE_ROUTES_BY_NETWORK } from "@/config/chains";
import { ChevronDown } from "lucide-react";

const NETWORKS: { id: NetworkId; label: string }[] = [
  { id: "mainnet", label: "Mainnet" },
  { id: "testnet", label: "Testnet" },
];

export function NetworkToggle() {
  const { network, setNetwork } = useNetworkStore();
  const resetForm = useBridgeStore((s) => s.resetForm);
  const setSourceChainId = useBridgeStore((s) => s.setSourceChainId);
  const setDestChainId = useBridgeStore((s) => s.setDestChainId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSwitch = (next: NetworkId) => {
    if (next === network) {
      setOpen(false);
      return;
    }
    setNetwork(next);
    resetForm();
    const routes = BRIDGE_ROUTES_BY_NETWORK[next];
    if (routes[0]) {
      setSourceChainId(routes[0].sourceChainId);
      setDestChainId(routes[0].destChainId);
    }
    setOpen(false);
  };

  const current = NETWORKS.find((n) => n.id === network)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            network === "mainnet" ? "bg-success" : "bg-amber-400"
          }`}
        />
        <span className="text-xs font-mono font-medium text-foreground">
          {current.label}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[120px] rounded-md border border-border bg-popover shadow-md py-1">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSwitch(n.id);
              }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs font-mono transition-colors ${
                n.id === network
                  ? "text-foreground bg-muted/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  n.id === "mainnet" ? "bg-success" : "bg-amber-400"
                }`}
              />
              {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
