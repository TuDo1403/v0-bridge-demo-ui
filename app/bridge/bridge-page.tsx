"use client";

import { PageShell } from "@/components/bridge/page-shell";
import { BridgePanel } from "@/components/bridge/bridge-panel";
import { InfoPanel } from "@/components/bridge/info-panel";
import { RecentSessions } from "@/components/bridge/recent-sessions";
import { LaneStatusBar } from "@/components/bridge/lane-status";
import { useLaneStatus } from "@/hooks/use-lane-status";

export function BridgePage() {
  const { lanes, isLoading: isLanesLoading } = useLaneStatus();

  return (
    <PageShell>
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Left: Main bridge panel */}
        <main className="flex-1 min-w-0">
          <BridgePanel />
        </main>

        {/* Right: Info + Lane status + Recent sessions */}
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-3 sm:gap-4">
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <InfoPanel />
          </div>
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <LaneStatusBar lanes={lanes} isLoading={isLanesLoading} />
          </div>
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <RecentSessions />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
