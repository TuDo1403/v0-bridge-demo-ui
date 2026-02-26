"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function AddressPill({ label, address }: { label: string; address?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="font-mono text-[11px] text-foreground truncate">
        {truncated}
      </span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={`Copy ${label} address`}
      >
        {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      </button>
    </div>
  );
}
