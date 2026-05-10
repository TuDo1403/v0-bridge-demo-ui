"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, type Address, type Hash } from "viem";
import { ArrowRight, Loader2, AlertTriangle, Anchor } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBridgeStore } from "@/lib/bridge-store";
import { useNetworkStore } from "@/lib/network-store";
import { CONTRACTS } from "@/config/contracts";
import { CHAINS, chainIdToEid } from "@/config/chains";
import {
  l1StandardBridgeAbi,
  l2StandardBridgeAbi,
  ETH_L2_TOKEN_ALIAS,
  DEFAULT_NATIVE_BRIDGE_GAS_LIMIT,
} from "@/lib/native-abi";
import {
  lookupBridgeJobsByTxHash,
  pollNativeStatus,
  selectUniqueBridgeJobCandidate,
  type BridgeJobMatchCriteria,
} from "@/lib/bridge-service";
import { cn } from "@/lib/utils";

/**
 * NativeBridgeAction is the action-button + status-row block that BridgePanel
 * renders in place of the LZ submit button when the user picks `tokenKey
 * === "ETH"`. All form inputs (chain selectors, amount, recipient) come from
 * the shared BridgePanel form state — this component only owns the wagmi
 * call, the receipt wait, the gateway notify, the session creation, and the
 * status poll loop.
 *
 * Flow:
 *   1. wagmi useWriteContract → L1StandardBridge.bridgeETHTo (deposit) or
 *      L2StandardBridge.withdrawTo (withdraw). The exact metadata signed is
 *      snapshot into store.pendingNativeTx so post-receipt registration uses
 *      the values committed on-chain even if the user mutates the form (or
 *      this component unmounts via a token toggle) before the receipt lands.
 *   2. waitForTransactionReceipt resolves → create a local session and poll
 *      native status by the source tx hash until the event indexer creates the job.
 *   3. Once indexed, attach the jobId and start a 5s recursive-setTimeout poll
 *      on /native/status/{jobId}. setTimeout
 *      avoids the overlapping-request risk that setInterval has when poll
 *      latency exceeds the 5s cadence. TrackingCard renders
 *      <NativePhaseTimeline> automatically when session.bridgeKind ===
 *      "native".
 */
export function NativeBridgeAction() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  useChainId(); // re-render on chain switch

  const sourceChainId = useBridgeStore((s) => s.sourceChainId);
  const destChainId = useBridgeStore((s) => s.destChainId);
  const amount = useBridgeStore((s) => s.amount);
  const recipientAddress = useBridgeStore((s) => s.recipientAddress);
  const direction = useBridgeStore((s) => s.direction);
  const createSession = useBridgeStore((s) => s.createSession);
  const updateSession = useBridgeStore((s) => s.updateSession);
  const activeSession = useBridgeStore((s) => s.activeSession);
  const pendingNativeTx = useBridgeStore((s) => s.pendingNativeTx);
  const setPendingNativeTx = useBridgeStore((s) => s.setPendingNativeTx);
  const network = useNetworkStore((s) => s.network);

  const srcChain = CHAINS[sourceChainId];
  const dstChain = CHAINS[destChainId];
  const srcContracts = CONTRACTS[sourceChainId];

  const { writeContractAsync, isPending: isSubmitting } = useWriteContract();
  // Receipt wait keys off the persisted pendingNativeTx so wagmi resumes
  // watching the same tx hash if the component unmounts and remounts (e.g.
  // user toggles ETH → USDC → ETH while the tx is still in mempool).
  const { isLoading: isWaitingReceipt, data: receipt } = useWaitForTransactionReceipt({
    hash: pendingNativeTx?.hash,
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recipient = (recipientAddress || address || "") as Address | "";
  const recipientValid = recipient !== "" && /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const amountValid = amount !== "" && parseFloat(amount) > 0;
  const onCorrectNetwork = walletChainId === sourceChainId;
  const busy = isSubmitting || isWaitingReceipt;
  const canSubmit =
    isConnected &&
    onCorrectNetwork &&
    amountValid &&
    recipientValid &&
    !busy &&
    !pendingNativeTx;

  const submit = useCallback(async () => {
    if (!isConnected || !address || !srcContracts) return;
    if (!amountValid || !recipientValid) return;
    const srcEid = srcChain?.lzEid;
    const dstEid = dstChain?.lzEid;
    if (!srcEid || !dstEid) {
      setErrorMsg("Chain config missing lzEid");
      return;
    }

    setErrorMsg(null);
    setStatusMsg("Awaiting wallet signature…");

    let txHash: Hash;
    let amountRaw = "";
    try {
      const value = parseEther(amount);
      amountRaw = value.toString();
      const minGasLimit = DEFAULT_NATIVE_BRIDGE_GAS_LIMIT;
      if (direction === "deposit") {
        if (!srcContracts.l1StandardBridge) throw new Error("L1 standard bridge not configured");
        txHash = await writeContractAsync({
          chainId: sourceChainId,
          address: srcContracts.l1StandardBridge,
          abi: l1StandardBridgeAbi,
          functionName: "bridgeETHTo",
          args: [recipient as Address, minGasLimit, "0x"],
          value,
        });
      } else {
        if (!srcContracts.l2StandardBridge) throw new Error("L2 standard bridge not configured");
        txHash = await writeContractAsync({
          chainId: sourceChainId,
          address: srcContracts.l2StandardBridge,
          abi: l2StandardBridgeAbi,
          functionName: "withdrawTo",
          args: [ETH_L2_TOKEN_ALIAS, recipient as Address, value, minGasLimit, "0x"],
          value,
        });
      }
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setErrorMsg(m);
      setStatusMsg(null);
      return;
    }

    // Snapshot the exact metadata that was signed. From here on the
    // post-receipt effect reads from this snapshot — never from the live
    // form state, which the user could mutate (or this component could be
    // unmounted) before the receipt arrives.
    setPendingNativeTx({
      hash: txHash,
      direction,
      sender: address,
      receiver: recipient as Address,
      srcEid,
      dstEid,
      sourceChainId,
      destChainId,
      amountRaw,
      network,
    });
    setStatusMsg("Tx submitted, waiting for confirmation…");
  }, [
    isConnected,
    address,
    srcContracts,
    amountValid,
    recipientValid,
    direction,
    sourceChainId,
    recipient,
    amount,
    writeContractAsync,
    srcChain?.lzEid,
    dstChain?.lzEid,
    network,
    setPendingNativeTx,
  ]);

  // Single source of truth for the 5s poll loop. Used both by the post-tx
  // submit flow (after the gateway hands back a jobId) and by the
  // resume-polling effect that recovers in-flight native sessions across page
  // reloads / component remounts. polledJobIdRef guards against starting a
  // second timer for the same job if both effects fire concurrently.
  // Recursive setTimeout (not setInterval): the next tick is scheduled only
  // after the current poll resolves, so a slow response can never produce
  // overlapping requests.
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polledJobIdRef = useRef<string | null>(null);
  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    polledJobIdRef.current = null;
  }, []);

  const nativeLookupCriteria = useCallback(
    (overrides?: Partial<BridgeJobMatchCriteria>): BridgeJobMatchCriteria => ({
      bridgeKind: "native",
      direction: overrides?.direction ?? activeSession?.direction ?? direction,
      srcEid:
        overrides?.srcEid ??
        (activeSession ? chainIdToEid(activeSession.sourceChainId) : srcChain?.lzEid),
      dstEid:
        overrides?.dstEid ??
        (activeSession ? chainIdToEid(activeSession.destChainId) : dstChain?.lzEid),
      sender: overrides?.sender ?? activeSession?.userAddress ?? address,
      receiver: overrides?.receiver ?? activeSession?.recipientAddress ?? recipient,
      amount: overrides?.amount ?? activeSession?.nativeAmountRaw,
    }),
    [activeSession, address, direction, dstChain?.lzEid, recipient, srcChain?.lzEid],
  );
  const startPolling = useCallback(
    (sessionId: string, jobId: string) => {
      if (polledJobIdRef.current === jobId) return;
      stopPolling();
      polledJobIdRef.current = jobId;

      const tick = async () => {
        // Bail if a remount or stopPolling reassigned the active poll job.
        if (polledJobIdRef.current !== jobId) return;
        try {
          const view = await pollNativeStatus(jobId, network);
          if (polledJobIdRef.current !== jobId) return;
          if (view) {
            updateSession(sessionId, {
              nativePhase: view.nativePhase,
              status:
                view.nativePhase === "finalized" || view.nativePhase === "l2_credited"
                  ? "completed"
                  : "bridge_submitted",
            });
            const terminal =
              view.nativePhase === "finalized" ||
              view.nativePhase === "l2_credited" ||
              view.nativePhase === "failed";
            if (terminal) {
              stopPolling();
              return;
            }
          }
        } catch (e) {
          // Transient — keep polling until terminal state.
          console.warn("native poll error", e);
        }
        if (polledJobIdRef.current !== jobId) return;
        pollTimeoutRef.current = setTimeout(tick, 5000);
      };
      pollTimeoutRef.current = setTimeout(tick, 5000);
    },
    [network, stopPolling, updateSession],
  );

  const startNativeTxLookup = useCallback(
    (sessionId: string, txHash: Hash, criteria?: BridgeJobMatchCriteria) => {
      const pollKey = `tx:${txHash}`;
      if (polledJobIdRef.current === pollKey) return;
      stopPolling();
      polledJobIdRef.current = pollKey;
      const lookupCriteria = criteria ?? nativeLookupCriteria();

      const tick = async () => {
        if (polledJobIdRef.current !== pollKey) return;
        try {
          const jobs = await lookupBridgeJobsByTxHash(txHash, network);
          const view = selectUniqueBridgeJobCandidate(jobs, lookupCriteria);
          if (polledJobIdRef.current !== pollKey) return;
          if (view?.jobId) {
            const phase = view.phase ?? "pending_l2_init";
            updateSession(sessionId, {
              jobId: view.jobId,
              nativePhase: phase,
              status:
                phase === "finalized" || phase === "l2_credited"
                  ? "completed"
                  : "bridge_submitted",
            });
            setStatusMsg(`Tracking job ${view.jobId.slice(0, 8)}…`);
            startPolling(sessionId, view.jobId);
            return;
          }
          setStatusMsg("Confirmed. Waiting for indexer to create a unique matching job…");
        } catch (e) {
          console.warn("native tx lookup error", e);
        }
        if (polledJobIdRef.current !== pollKey) return;
        pollTimeoutRef.current = setTimeout(tick, 5000);
      };
      pollTimeoutRef.current = setTimeout(tick, 0);
    },
    [nativeLookupCriteria, network, startPolling, stopPolling, updateSession],
  );

  // After the user-side tx is mined, start event-indexer lookup. Reads metadata
  // from the submit-time snapshot in
  // pendingNativeTx, not the live form, so it stays correct even if the
  // user mutated form fields between submit and receipt arriving.
  useEffect(() => {
    if (!receipt || !pendingNativeTx) return;
    let cancelled = false;
    const snapshot = pendingNativeTx;
    (async () => {
      try {
        setStatusMsg("Confirmed. Waiting for indexer…");
        const session = createSession({
          userAddress: snapshot.sender,
          recipientAddress: snapshot.receiver,
          depositAddress: "",
        });
        updateSession(session.id, {
          nativePhase:
            snapshot.direction === "deposit" ? "pending_l1_init" : "pending_l2_init",
          selfBridgeTxHash: snapshot.hash,
          status: "bridge_submitted",
          sourceChainId: snapshot.sourceChainId,
          destChainId: snapshot.destChainId,
          direction: snapshot.direction,
          nativeAmountRaw: snapshot.amountRaw,
        });
        if (cancelled) return;
        setPendingNativeTx(null);
        startNativeTxLookup(session.id, snapshot.hash, {
          bridgeKind: "native",
          direction: snapshot.direction,
          srcEid: snapshot.srcEid,
          dstEid: snapshot.dstEid,
          sender: snapshot.sender,
          receiver: snapshot.receiver,
          amount: snapshot.amountRaw,
        });
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErrorMsg(`Native tx tracking failed: ${m}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    receipt,
    pendingNativeTx,
    createSession,
    updateSession,
    setPendingNativeTx,
    startNativeTxLookup,
  ]);

  // Resume polling for any in-flight native session — covers page reloads and
  // component remounts where wagmi's `receipt`/`pendingNativeTx` are gone but
  // the session in localStorage still has a jobId and a non-terminal
  // nativePhase.
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.bridgeKind !== "native") return;
    if (!activeSession.jobId && activeSession.selfBridgeTxHash) {
      startNativeTxLookup(activeSession.id, activeSession.selfBridgeTxHash as Hash);
      return;
    }
    if (!activeSession.jobId) return;
    const phase = activeSession.nativePhase;
    if (phase === "finalized" || phase === "l2_credited" || phase === "failed") return;
    startPolling(activeSession.id, activeSession.jobId);
  }, [activeSession, startNativeTxLookup, startPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return (
    <div className="flex flex-col gap-2">
      {/* Network mismatch banner */}
      {isConnected && !onCorrectNetwork && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-[11px] font-mono text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">
            Wallet is on chain {walletChainId}; switch to{" "}
            <span className="text-foreground">{srcChain?.shortLabel}</span> to sign.
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={() => switchChain({ chainId: sourceChainId })}
          >
            Switch
          </Button>
        </div>
      )}

      {/* Error / status */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 text-[11px] font-mono text-destructive-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {!errorMsg && statusMsg && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-[11px] font-mono text-primary">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Submit */}
      <Button onClick={submit} disabled={!canSubmit} className="h-10 w-full font-mono">
        <Anchor className={cn("h-4 w-4 mr-2", busy && "animate-pulse")} />
        Bridge ETH ({direction === "deposit" ? "L1 → L2" : "L2 → L1"})
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>

      {pendingNativeTx?.hash && (
        <div className="text-[10px] font-mono text-muted-foreground">
          Tx:{" "}
          <a
            href={srcChain?.explorerTxUrl?.(pendingNativeTx.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {pendingNativeTx.hash.slice(0, 10)}…{pendingNativeTx.hash.slice(-6)}
          </a>
        </div>
      )}
    </div>
  );
}
