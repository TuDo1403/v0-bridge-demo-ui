"use client";

import { PhaseProgressBar } from "./phase-progress-bar";
import {
  NATIVE_DEPOSIT_PHASES,
  NATIVE_WITHDRAW_PHASES,
  nativeDepositLabels,
  nativeWithdrawLabels,
  type NativeDepositPhase,
  type NativeWithdrawPhase,
} from "@/lib/native-phases";

interface NativePhaseTimelineProps {
  direction: "deposit" | "withdraw";
  /** The current native_phase value as returned by the BE. */
  phase: string;
  /** Optional countdown text to render below the bar (e.g. "Maturity unlocks
   *  in 8m 14s"). Computed by the parent from proven_at + maturity window. */
  caption?: string;
}

/**
 * Renders the native bridge phase progression as a generic <PhaseProgressBar>
 * keyed off the deposit/withdraw step list in lib/native-phases.ts.
 */
export function NativePhaseTimeline({ direction, phase, caption }: NativePhaseTimelineProps) {
  return (
    <div className="flex flex-col gap-1">
      {direction === "deposit" ? (
        <PhaseProgressBar<NativeDepositPhase>
          steps={[...NATIVE_DEPOSIT_PHASES]}
          current={mapDepositPhase(phase)}
          labels={nativeDepositLabels}
        />
      ) : (
        <PhaseProgressBar<NativeWithdrawPhase>
          steps={[...NATIVE_WITHDRAW_PHASES]}
          current={mapWithdrawPhase(phase)}
          labels={nativeWithdrawLabels}
        />
      )}
      {caption && (
        <span className="text-[10px] font-mono text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}

function mapDepositPhase(phase: string): NativeDepositPhase | "failed" | "recovered" {
  if (phase === "failed") return "failed";
  if (NATIVE_DEPOSIT_PHASES.includes(phase as NativeDepositPhase)) {
    return phase as NativeDepositPhase;
  }
  // Unknown / pre-step phase: pin to the earliest step so the bar renders.
  return NATIVE_DEPOSIT_PHASES[0];
}

function mapWithdrawPhase(phase: string): NativeWithdrawPhase | "failed" | "recovered" {
  if (phase === "failed") return "failed";
  if (NATIVE_WITHDRAW_PHASES.includes(phase as NativeWithdrawPhase)) {
    return phase as NativeWithdrawPhase;
  }
  return NATIVE_WITHDRAW_PHASES[0];
}
