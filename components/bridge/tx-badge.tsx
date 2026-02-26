"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TxBadgeProps {
  label: string;
  hash?: string;
  explorerUrl?: string;
  className?: string;
}

export function TxBadge({ label, hash, explorerUrl, className }: TxBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded bg-muted/50 text-xs font-mono",
          className
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">--</span>
      </div>
    );
  }

  const truncated = `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded bg-muted/50 text-xs font-mono group",
        className
      )}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground truncate">{truncated}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy hash"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="View on explorer"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
