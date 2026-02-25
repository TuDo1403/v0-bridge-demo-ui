"use client";

import { ExternalLink } from "lucide-react";
import { EXTERNAL_LINKS } from "@/config/chains";

const links = [
  { label: "LZ Scan", url: EXTERNAL_LINKS.lzTools },
  { label: "API", url: EXTERNAL_LINKS.lzApi },
  { label: "OFT Docs", url: EXTERNAL_LINKS.oftDocs },
  { label: "Portfolio", url: EXTERNAL_LINKS.risePortfolio },
];

export function ExternalLinksBar() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {links.map((link) => (
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
