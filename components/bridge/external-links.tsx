"use client";

import { ExternalLink } from "lucide-react";
import { getExternalLinks } from "@/config/chains";
import { useNetworkStore } from "@/lib/network-store";

export function ExternalLinksBar() {
  const network = useNetworkStore((s) => s.network);
  const links = getExternalLinks(network);

  const items = [
    { label: "LZ Scan", url: links.lzTools },
    { label: "API", url: links.lzApi },
    { label: "OFT Docs", url: links.oftDocs },
    { label: "Portfolio", url: links.risePortfolio },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-primary transition-colors"
        >
          {link.label}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
    </div>
  );
}
