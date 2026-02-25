"use client";

import { PageShell } from "@/components/bridge/page-shell";
import { BridgePanel } from "@/components/bridge/bridge-panel";
import { InfoPanel } from "@/components/bridge/info-panel";
import { RecentSessions } from "@/components/bridge/recent-sessions";

export function BridgePage() {
  return (
    <PageShell>
      <div className="flex flex-col lg:flex-row gap-6">
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
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
          <div className="p-4 rounded-lg border border-border bg-card">
            <InfoPanel />
          </div>
          <div className="p-4 rounded-lg border border-border bg-card">
            <RecentSessions />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
