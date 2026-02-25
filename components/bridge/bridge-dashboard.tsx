"use client";

import { BridgeHeader } from "./header";
import { BridgePanel } from "./bridge-panel";
import { InfoPanel } from "./info-panel";
import { RecentSessions } from "./recent-sessions";

export function BridgeDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        {/* Header */}
        <BridgeHeader />

        {/* Main grid: Bridge + Sidebar */}
        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          {/* Left: Main bridge panel */}
          <main className="flex-1 min-w-0">
            <div className="p-4 sm:p-5 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Bridge Terminal
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <BridgePanel />
            </div>
          </main>

          {/* Right: Info + Recent sessions */}
          <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-4">
            <div className="p-4 rounded-lg border border-border bg-card">
              <InfoPanel />
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <RecentSessions />
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-8 pb-4 flex items-center justify-between text-[10px] font-mono text-muted-foreground/40">
          <span>RISE Global Deposit Bridge v0.1.0</span>
          <span>Testnet Only</span>
        </footer>
      </div>
    </div>
  );
}
