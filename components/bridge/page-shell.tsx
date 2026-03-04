"use client";

import { BridgeHeader } from "./header";
import { ExternalLinksBar } from "./external-links";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-6">
        <BridgeHeader />
        <div className="mt-4 sm:mt-6">{children}</div>
        <footer className="mt-6 sm:mt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground/40">
          <span>RISE Bridge v0.2.0</span>
          <div className="flex items-center gap-4">
            <ExternalLinksBar />
          </div>
          <span>Testnet Only</span>
        </footer>
      </div>
    </div>
  );
}
