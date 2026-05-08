// Native (OP Stack) bridge phase constants — must mirror api/internal/repo/native.go
// constants exactly. The display labels and step ordering drive the
// <PhaseProgressBar> timeline component.
//
// The 1200s proof-maturity wait is rendered with `proven` left as the active
// (pulsing) step and the parent component supplying a countdown caption —
// not as a separate phase, because the BE never sets a distinct
// "awaiting_finalization" phase (the reconciler advances proven →
// ready_to_finalize directly via AdvanceNativePhaseByTime).

export const NATIVE_DEPOSIT_PHASES = [
  "pending_l1_init",
  "l1_confirmed",
  "l2_credited",
] as const;
export type NativeDepositPhase = (typeof NATIVE_DEPOSIT_PHASES)[number];

export const nativeDepositLabels: Record<NativeDepositPhase, string> = {
  pending_l1_init: "L1 tx submitted",
  l1_confirmed: "L1 confirmed",
  l2_credited: "L2 credited",
};

export const NATIVE_WITHDRAW_PHASES = [
  "pending_l2_init",
  "awaiting_game",
  "ready_to_prove",
  "proving",
  "proven",
  "ready_to_finalize",
  "finalizing",
  "finalized",
] as const;
export type NativeWithdrawPhase = (typeof NATIVE_WITHDRAW_PHASES)[number];

export const nativeWithdrawLabels: Record<NativeWithdrawPhase, string> = {
  pending_l2_init: "L2 tx submitted",
  awaiting_game: "Awaiting state proposal",
  ready_to_prove: "Ready to prove",
  proving: "Proving on L1",
  proven: "Proof submitted (maturity wait)",
  ready_to_finalize: "Ready to claim",
  finalizing: "Claiming on L1",
  finalized: "Done",
};

/** Failure phase — rendered as terminal badge, not a step. `game_invalidated`
 *  is intentionally NOT here: when AnchorStateRegistry blacklists a game the
 *  BE bounces affected withdrawals back to `awaiting_game`, not to a distinct
 *  invalidated terminal state. Only `failed` is observable. */
export const NATIVE_TERMINAL_PHASES = ["failed"] as const;
export type NativeTerminalPhase = (typeof NATIVE_TERMINAL_PHASES)[number];

/** Returns true when a deposit phase is the terminal happy-path state. */
export function isNativeDepositComplete(phase?: string): boolean {
  return phase === "l2_credited";
}

/** Returns true when a withdrawal phase is the terminal happy-path state. */
export function isNativeWithdrawComplete(phase?: string): boolean {
  return phase === "finalized";
}
