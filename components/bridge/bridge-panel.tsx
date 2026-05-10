"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  usePublicClient,
  useBalance,
  useReadContracts,
} from "wagmi";
import {
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { useBridgeStore } from "@/lib/bridge-store";
import { riseGlobalDepositAbi, riseGlobalWithdrawAbi, erc20Abi, oftConversionRateAbi, oftRateLimitAbi } from "@/lib/abi";
import { CHAINS, BRIDGE_ROUTES_BY_NETWORK, chainIdToEid } from "@/config/chains";
import { useDepositAddress } from "@/hooks/use-deposit-address";
import { useVaultStatus } from "@/hooks/use-vault-status";
import { useLzQuote } from "@/hooks/use-lz-quote";
import { usePermit2 } from "@/hooks/use-permit2";
import { useEIP2612 } from "@/hooks/use-eip2612";
import { useComposeMsg } from "@/hooks/use-compose-msg";
import { DappSelector } from "./dapp-selector";
import { BridgeModeToggle } from "./bridge-mode-toggle";
import { NativeBridgeAction } from "./native-bridge-action";
import { isNativeBridgeAvailable } from "@/lib/bridge-store";
import { isNativeToken, ETH_TOKEN_KEY } from "@/config/contracts";
import {
  TOKENS,
  SUPPORTED_TOKEN_KEYS,
  getTokenAddress as getTokenAddressFallback,
  getGlobalDepositAddress,
  getGlobalWithdrawAddress,
  getBridgeDirection,
  isRoundTripDapp as isRoundTripFallback,
} from "@/config/contracts";
import {
  useBridgeConfig,
  isDappRoundTrip,
  getTokenOptions,
  findTokenById,
  resolveTokenAddress,
} from "@/lib/bridge-config";
import {
  submitPermit,
  pollBridgeStatus,
  pollLzScan,
  lookupBridgeJobsByTxHash,
  lookupByTxHash,
  isTerminalStatus,
  selectUniqueBridgeJobCandidate,
  type BridgeJobMatchCriteria,
  lookupNativeByTxHash,
  pollNativeStatus,
} from "@/lib/bridge-service";
import { useNetworkStore } from "@/lib/network-store";
import { CONTRACT_ERROR_MAP, mapBackendStatus, isComposeFailed, type BridgeStatus, type BridgeSession, type TxHashPair } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChainIcon, TokenIcon } from "./chain-icon";
import { StatusRail } from "./status-rail";
import { TrackingCard } from "./tracking-card";
import { TxBadge } from "./tx-badge";
import { FeeSummary, type RateLimitSummary } from "./fee-summary";
import { RecoveryPanel } from "./recovery-panel";
import {
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Shield,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RateLimitBucket = {
  capacity: bigint;
  refillPerBlock: bigint;
  available: bigint;
  lastBlock: bigint;
  enabled: boolean;
};

function isEnabledBucket(bucket: unknown): bucket is RateLimitBucket {
  return !!bucket && typeof bucket === "object" && "enabled" in bucket && (bucket as { enabled: boolean }).enabled;
}

function compactAmount(value: bigint, decimals: number, symbol: string): string {
  const numeric = Number(formatUnits(value, decimals));
  return `${numeric.toLocaleString(undefined, {
    maximumFractionDigits: numeric >= 100 ? 0 : 2,
  })} ${symbol}`;
}

async function waitForIndexedLzJob(
  txHash: string,
  network: "mainnet" | "testnet",
  criteria: BridgeJobMatchCriteria,
  attempts = 60,
): Promise<TxHashPair | null> {
  for (let i = 0; i < attempts; i++) {
    const jobs = await lookupBridgeJobsByTxHash(txHash, network).catch(() => []);
    const job = selectUniqueBridgeJobCandidate(jobs, criteria);
    if (job?.jobId) {
      return {
        vault_fund_tx_hash: txHash,
        bridge_tx_hash: "",
        job_id: job.jobId,
        status: job.status,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return null;
}

function lzJobCriteriaForSession(
  session: BridgeSession,
  tokenAddress: string | undefined,
  tokenDecimals: number | undefined,
): BridgeJobMatchCriteria {
  let rawAmount: string | undefined;
  if (session.amount && tokenDecimals != null) {
    try {
      rawAmount = parseUnits(session.amount, tokenDecimals).toString();
    } catch {
      rawAmount = undefined;
    }
  }
  return {
    bridgeKind: "lz",
    direction: session.direction,
    srcEid: chainIdToEid(session.sourceChainId),
    dstEid: chainIdToEid(session.destChainId),
    sender: session.userAddress,
    receiver: session.recipientAddress,
    token: tokenAddress,
    amount: rawAmount,
  };
}

function isNativeSession(session: BridgeSession | null | undefined): session is BridgeSession {
  return session?.bridgeKind === "native";
}

function isTerminalNativePhase(phase: string | undefined): boolean {
  return phase === "finalized" || phase === "l2_credited" || phase === "failed";
}

function statusFromNativePhase(phase: string, fallback: BridgeStatus): BridgeStatus {
  if (phase === "finalized" || phase === "l2_credited") return "completed";
  if (phase === "failed") return "failed";
  return fallback;
}

async function fetchNativeViewForSession(
  session: BridgeSession,
  network: "mainnet" | "testnet",
) {
  if (session.jobId) return pollNativeStatus(session.jobId, network);
  if (session.selfBridgeTxHash) return lookupNativeByTxHash(session.selfBridgeTxHash, network);
  return null;
}

export function BridgePanel() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const network = useNetworkStore((s) => s.network);
  const { config: bridgeConfig } = useBridgeConfig();
  const showBridgeDebug = process.env.NEXT_PUBLIC_BRIDGE_DEBUG === "1";

  const {
    sourceChainId,
    destChainId,
    tokenKey,
    amount,
    depositAddress,
    direction,
    dappId,
    recipientAddress,
    bridgeMode,
    transferMode,
    bridgeKind,
    activeSession,
    setSourceChainId,
    setDestChainId,
    setTokenKey,
    setAmount,
    setDepositAddress,
    setDappId,
    setRecipientAddress,
    setBridgeMode,
    setTransferMode,
    setBridgeKind,
    swapDirection,
    createSession,
    updateSession,
    setActiveSession,
    resetForm,
    loadRecentSessions,
    recentSessions,
  } = useBridgeStore();

  // Derive step from session state — single source of truth
  const step = useMemo((): "form" | "transfer" | "polling" | "complete" => {
    if (!activeSession) return "form";
    const s = activeSession.status;

    // Terminal: completed
    if (s === "completed") return "complete";

    // Has tracking context (jobId, selfBridgeTxHash, backendProcessTxHash) = show tracking
    // This includes failed/error sessions that had backend interaction
    if (activeSession.jobId || activeSession.selfBridgeTxHash || activeSession.backendProcessTxHash) {
      return "polling";
    }

    // Transfer in progress (pre-bridge) — only for vault-funded flows.
    // Permit sessions skip the transfer step entirely (sign → backend → polling).
    if (activeSession.transferMode !== "permit2" && activeSession.transferMode !== "eip2612" &&
        (s === "awaiting_transfer" || s === "transfer_submitted" ||
        s === "transfer_mined" || s === "deposit_verified")) {
      return "transfer";
    }

    // Has user transfer tx hash but no bridge tracking context = show tracking
    // (e.g. operator vault-funded session waiting for backend submission)
    if (activeSession.userTransferTxHash && activeSession.userTransferTxHash !== "permit2" && activeSession.userTransferTxHash !== "permit" &&
        s !== "idle") {
      return "polling";
    }

    // Error/failed for a real session (has deposit address) = show tracking card
    if ((s === "error" || s === "failed") && activeSession.depositAddress) {
      return "polling";
    }

    return "form";
  }, [activeSession]);

  const [error, setError] = useState<string | null>(null);
  const [depositCopied, setDepositCopied] = useState(false);
  const [showRecipient, setShowRecipient] = useState(false);
  const [manualTxHash, setManualTxHash] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [isPermitSubmitting, setIsPermitSubmitting] = useState(false);

  // Reset stuck permit2 submitting state when user changes form inputs
  useEffect(() => {
    setIsPermitSubmitting(false);
  }, [amount, tokenKey, sourceChainId, destChainId, transferMode, bridgeMode]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lzPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const returnLegRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load recent sessions on mount
  useEffect(() => {
    loadRecentSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehydrate native bridge sessions after localStorage has populated the
  // recent list. The first render sees an empty list, so this must follow
  // recentSessions changes instead of running only once on mount.
  useEffect(() => {
    if (recentSessions.length === 0) return;
    const targets = recentSessions.filter(
      (s) =>
        isNativeSession(s) &&
        (s.jobId || s.selfBridgeTxHash) &&
        !isTerminalNativePhase(s.nativePhase),
    );
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const s of targets) {
        if (cancelled) return;
        try {
          const view = await fetchNativeViewForSession(s, network);
          if (cancelled || !view) continue;
          const status = statusFromNativePhase(view.nativePhase, s.status);
          if (s.jobId === view.jobId && s.nativePhase === view.nativePhase && s.status === status) continue;
          updateSession(s.id, {
            jobId: view.jobId,
            nativePhase: view.nativePhase,
            status,
          });
        } catch {
          // Transient — leave row alone; active tracking below keeps polling.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [network, recentSessions, updateSession]);

  // Keep the displayed native tracking card in sync while the user is looking
  // at it. NativeBridgeAction owns submit-time polling, but it is not mounted
  // once the session moves to the tracking view.
  useEffect(() => {
    if (!isNativeSession(activeSession)) return;
    if (!activeSession.jobId && !activeSession.selfBridgeTxHash) return;
    if (isTerminalNativePhase(activeSession.nativePhase)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      try {
        const view = await fetchNativeViewForSession(activeSession, network);
        if (cancelled || !view) return;
        const status = statusFromNativePhase(view.nativePhase, activeSession.status);
        if (
          activeSession.jobId !== view.jobId ||
          activeSession.nativePhase !== view.nativePhase ||
          activeSession.status !== status
        ) {
          updateSession(activeSession.id, {
            jobId: view.jobId,
            nativePhase: view.nativePhase,
            status,
          });
        }
        if (!isTerminalNativePhase(view.nativePhase)) {
          timer = setTimeout(sync, 5_000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(sync, 5_000);
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    activeSession?.bridgeKind,
    activeSession?.id,
    activeSession?.jobId,
    activeSession?.nativePhase,
    activeSession?.status,
    activeSession?.selfBridgeTxHash,
    network,
    updateSession,
  ]);

  // Resume polling + sync error when session changes (restore from localStorage or click)
  const sessionSelectedAt = useBridgeStore((s) => s.sessionSelectedAt);
  useEffect(() => {
    // Clear any lingering polling from a previous session when session changes
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (lzPollingRef.current) { clearInterval(lzPollingRef.current); lzPollingRef.current = null; }
    if (returnLegRef.current) { clearInterval(returnLegRef.current); returnLegRef.current = null; }

    if (!activeSession) return;

    // Sync error from session
    if (activeSession.error) setError(activeSession.error);

    const s = activeSession.status;

    // Detect orphaned sessions: status implies processing but no tracking data.
    // This happens when the wallet rejected or the page was closed before tx confirmed.
    const hasTrackingContext = !!(
      activeSession.jobId || activeSession.selfBridgeTxHash ||
      activeSession.backendProcessTxHash ||
      (activeSession.userTransferTxHash && activeSession.userTransferTxHash !== "permit2" && activeSession.userTransferTxHash !== "permit")
    );
    const isProcessingStatus = [
      "bridge_submitted", "bridge_mined", "source_verified",
      "lz_indexing", "lz_pending", "destination_confirmed", "backend_submitted",
    ].includes(s);
    if (isProcessingStatus && !hasTrackingContext) {
      updateSession(activeSession.id, {
        status: "error",
        error: "Bridge transaction was not confirmed.",
      });
      setError("Bridge transaction was not confirmed.");
      return;
    }

    // Operator mode: resume backend polling (unless backend already completed)
    if (activeSession.jobId && !isTerminalStatus(s) &&
        s !== "idle" && s !== "error" && s !== "failed") {
      startPolling(activeSession.jobId, activeSession.id);
    }

    // Resume LZ polling for any session with a bridge tx hash that isn't terminal.
    // Covers both self-bridge (selfBridgeTxHash) and operator-mode (backendProcessTxHash)
    // where backend already confirmed but LZ delivery is still pending.
    const lzTxHash = activeSession.selfBridgeTxHash ?? activeSession.backendProcessTxHash;
    if (lzTxHash && !isTerminalStatus(s) && s !== "completed" && !s.startsWith("roundtrip_")) {
      startLzPolling(lzTxHash, activeSession.id, activeSession.dappId ?? 0);
    }

    // Resume return-leg polling for roundtrip sessions
    if (s.startsWith("roundtrip_") && s !== "roundtrip_completed") {
      const composeTx = activeSession.lzTracking?.composeTxHash;
      if (composeTx) {
        startReturnLegPolling(composeTx, activeSession.id);
      }
    }

    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (lzPollingRef.current) { clearInterval(lzPollingRef.current); lzPollingRef.current = null; }
      if (returnLegRef.current) { clearInterval(returnLegRef.current); returnLegRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, sessionSelectedAt]);

  const isDeposit = direction === "deposit";
  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);
  const globalWithdrawAddr = getGlobalWithdrawAddress(sourceChainId);
  const routerAddr = isDeposit ? globalDepositAddr : globalWithdrawAddr;

  // Dynamic token list from backend config, with hardcoded fallback
  const srcEid = chainIdToEid(sourceChainId);
  const dstEid = chainIdToEid(destChainId);
  const dynamicTokens = useMemo(
    () => getTokenOptions(bridgeConfig, srcEid, dstEid),
    [bridgeConfig, srcEid, dstEid]
  );
  const availableTokenKeys = useMemo(() => {
    const base = dynamicTokens.length > 0
      ? dynamicTokens.map((t) => t.key)
      : SUPPORTED_TOKEN_KEYS;
    // ETH appears only on routes that have OP Stack native bridge contracts
    // configured on both ends. Picking ETH implicitly switches the form to
    // the native bridge flow — no separate kind toggle needed.
    if (isNativeBridgeAvailable(sourceChainId, destChainId) && !base.includes(ETH_TOKEN_KEY)) {
      return [...base, ETH_TOKEN_KEY];
    }
    return base.filter((k) => k !== ETH_TOKEN_KEY);
  }, [dynamicTokens, sourceChainId, destChainId]);

  // Auto-select first available token if current tokenKey is not in the list
  useEffect(() => {
    if (availableTokenKeys.length > 0 && !availableTokenKeys.includes(tokenKey)) {
      setTokenKey(availableTokenKeys[0]);
    }
  }, [availableTokenKeys, tokenKey, setTokenKey]);

  // Derive bridgeKind from the selected token. ETH = OP Stack native, every
  // other token = LayerZero OFT. The token picker is the only UX surface —
  // there is no separate kind toggle.
  const isNative = isNativeToken(tokenKey);
  useEffect(() => {
    setBridgeKind(isNative ? "native" : "lz");
  }, [isNative, setBridgeKind]);

  const tokenAddress = (
    resolveTokenAddress(bridgeConfig, tokenKey, srcEid) ??
    getTokenAddressFallback(tokenKey, sourceChainId)
  ) as `0x${string}` | undefined;
  const selectedDynamicToken = dynamicTokens.find((t) => t.key === tokenKey);
  const routeToken = selectedDynamicToken ? findTokenById(bridgeConfig, selectedDynamicToken.id) : undefined;
  const srcRouteToken = routeToken?.chains[String(srcEid)];
  const dstRouteToken = routeToken?.chains[String(dstEid)];
  const token = TOKENS[tokenKey] ?? (dynamicTokens.find((t) => t.key === tokenKey)
    ? { symbol: dynamicTokens.find((t) => t.key === tokenKey)!.symbol, name: dynamicTokens.find((t) => t.key === tokenKey)!.name, decimals: dynamicTokens.find((t) => t.key === tokenKey)!.decimals, addresses: {} }
    : undefined);

  // --- Read user wallet token balance ---
  // Two parallel readers: ERC20 balanceOf for token bridges, native useBalance
  // for ETH. Each is gated by `enabled` so wagmi only fetches the relevant
  // one. Pick the right value below.
  const { data: walletBalance, isLoading: isBalanceLoading } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: !!address && !!tokenAddress && !isNative,
      refetchInterval: 8_000,
      retry: 3,
      retryDelay: 2000,
    },
  });
  const { data: nativeBalance, isLoading: isNativeBalanceLoading } = useBalance({
    address,
    chainId: sourceChainId,
    query: {
      enabled: !!address && isNative,
      refetchInterval: 8_000,
    },
  });

  // Pick the right formatted balance based on the selected token. Keeping
  // `formattedWalletBalance` as the call-site identifier so the rest of the
  // panel (max button, validation, fee summary) is untouched by the ETH split.
  const formattedWalletBalance = isNative
    ? nativeBalance?.formatted ?? null
    : walletBalance !== undefined && walletBalance !== null && token
      ? formatUnits(walletBalance, token.decimals)
      : null;
  const isBalanceReadLoading = isNative ? isNativeBalanceLoading : isBalanceLoading;

  // --- Compute deposit address via backend API ---
  const destLzEid = CHAINS[destChainId]?.lzEid;

  const {
    depositAddress: computedDepositAddr,
    isLoading: isComputingDeposit,
    isError: isComputeError,
    refetch: retryComputeDeposit,
  } = useDepositAddress({
    sourceChainId,
    destChainId,
    dappId,
    address,
    recipientAddress: recipientAddress || undefined,
    direction,
  });

  useEffect(() => {
    if (computedDepositAddr) {
      setDepositAddress(computedDepositAddr);
    }
  }, [computedDepositAddr, setDepositAddress]);

  // --- EIP-2612 hook (detection + signing) — must be before effectiveTransferMode ---
  const eip2612 = useEIP2612({
    sourceChainId,
    tokenKey,
    enabled: true, // always detect so we can show/hide the option
  });

  // Use session's mode when a session is active; fall back to store (form) mode
  const effectiveBridgeMode = activeSession?.bridgeMode ?? bridgeMode;
  const baseTransferMode = activeSession?.transferMode ?? transferMode;
  // Auto-reset: if token doesn't support EIP-2612, fall back to vault
  const effectiveTransferMode =
    !eip2612?.supportsEIP2612 && baseTransferMode === "eip2612"
      ? "vault"
      : baseTransferMode;
  const isSelfBridge = effectiveBridgeMode === "self";
  const isPermit2 = effectiveTransferMode === "permit2";
  const isEIP2612 = effectiveTransferMode === "eip2612";
  const isPermitMode = isPermit2 || isEIP2612;

  // Session has funded vault but not yet bridged — needs LZ quote regardless of store bridgeMode
  // Only for self-bridge mode: operator mode submits to backend, not self-bridge
  const needsSelfBridgeQuote = !!(
    activeSession &&
    activeSession.bridgeMode === "self" &&
    activeSession.userTransferTxHash &&
    !activeSession.selfBridgeTxHash &&
    !activeSession.jobId &&
    !activeSession.backendProcessTxHash &&
    (activeSession.status === "transfer_mined" || activeSession.status === "deposit_verified")
  );

  // Memoize parsed amount for Permit2 allowance check
  const permit2Amount = useMemo(() => {
    if (!amount || !token) return 0n;
    try { return parseUnits(amount, token.decimals); } catch { return 0n; }
  }, [amount, token]);

  // --- Permit2 hook (both operator and self-bridge) ---
  const permit2 = usePermit2({
    sourceChainId,
    destChainId,
    tokenKey,
    direction,
    amount: permit2Amount,
    enabled: isPermit2,
  });

  // --- Self-bridge writeContract (deposit/withdraw) ---
  const {
    writeContract: writeSelfBridge,
    data: selfBridgeHash,
    isPending: isSelfBridgePending,
    error: selfBridgeError,
    reset: resetSelfBridge,
  } = useWriteContract();

  const { isLoading: isWaitingSelfBridge, isSuccess: isSelfBridgeMined } =
    useWaitForTransactionReceipt({
      hash: selfBridgeHash,
      chainId: sourceChainId,
    });

  // Handle self-bridge error
  useEffect(() => {
    if (selfBridgeError) {
      const msg = selfBridgeError.message ?? "Self-bridge failed";
      for (const [key, friendly] of Object.entries(CONTRACT_ERROR_MAP)) {
        if (msg.includes(key)) {
          setError(friendly);
          return;
        }
      }
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    }
  }, [selfBridgeError]);

  // When self-bridge tx hash appears (user confirmed in wallet), create/update session
  useEffect(() => {
    if (!selfBridgeHash || !address) return;
    if (activeSession?.selfBridgeTxHash === selfBridgeHash) return;

    if (activeSession) {
      // Vault-funded self-bridge: session exists from transfer step, add bridge hash
      updateSession(activeSession.id, {
        selfBridgeTxHash: selfBridgeHash,
        status: "bridge_submitted",
      });
    } else if (depositAddress) {
      // Permit2 self-bridge: no session yet, create one now
      const session = createSession({
        userAddress: address,
        recipientAddress: recipientAddress || address,
        depositAddress,
      });
      updateSession(session.id, {
        selfBridgeTxHash: selfBridgeHash,
        status: "bridge_submitted",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfBridgeHash]);

  // When self-bridge tx is mined, start LZ polling
  useEffect(() => {
    if (isSelfBridgeMined && selfBridgeHash && activeSession?.selfBridgeTxHash) {
      startLzPolling(selfBridgeHash, activeSession.id, activeSession.dappId ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelfBridgeMined]);

  // --- Read fee config from contract ---
  const { data: feeConfig } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "getFeeConfig",
    chainId: sourceChainId,
    query: { enabled: !!routerAddr, refetchInterval: 30_000, retry: 3, retryDelay: 2000 },
  });

  // feeConfig returns [feeBps: uint16, feeCollector: address]
  const feeBps = feeConfig ? BigInt((feeConfig as [number, string])[0]) : 50n; // default 0.5%

  // --- Read per-token fee config (mode + flatFee) ---
  const { data: tokenFeeConfig } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "getTokenFeeConfig",
    args: tokenAddress ? [tokenAddress] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!routerAddr && !!tokenAddress, refetchInterval: 30_000, retry: 3, retryDelay: 2000 },
  });
  const feeMode = tokenFeeConfig ? Number((tokenFeeConfig as [number, bigint])[0]) : 0;
  const flatFee = tokenFeeConfig ? BigInt((tokenFeeConfig as [number, bigint])[1]) : 0n;

  // --- Fee allowlist check (both deposit and withdrawal) ---
  const { data: isFeeExempt } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "isFeeAllowlisted",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!routerAddr && !!address, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  // --- Blocklist check: sender ---
  const { data: isSenderBlocked } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "isBlocked",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!routerAddr && !!address, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  // --- Blocklist check: recipient (if different from sender) ---
  const effectiveRecipient = recipientAddress || address;
  const recipientDiffersFromSender = !!recipientAddress && recipientAddress.toLowerCase() !== address?.toLowerCase();
  const { data: isRecipientBlocked } = useReadContract({
    address: routerAddr,
    abi: isDeposit ? riseGlobalDepositAbi : riseGlobalWithdrawAbi,
    functionName: "isBlocked",
    args: effectiveRecipient ? [effectiveRecipient as Address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!routerAddr && !!effectiveRecipient && recipientDiffersFromSender, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  const isBlocked = !!isSenderBlocked || !!isRecipientBlocked;

  // --- Read tokenConfig to get OFT address, then query decimalConversionRate ---
  const { data: tokenConfig } = useReadContract({
    address: isDeposit ? globalDepositAddr : undefined,
    abi: riseGlobalDepositAbi,
    functionName: "getTokenConfig",
    args: tokenAddress ? [tokenAddress] : undefined,
    chainId: sourceChainId,
    query: { enabled: isDeposit && !!globalDepositAddr && !!tokenAddress, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  // tokenConfig returns { oft: address, enabled: bool, lzReceiveGas: uint128 }
  const oftAddress = tokenConfig
    ? (tokenConfig as { oft: string; enabled: boolean; lzReceiveGas: bigint }).oft as Address
    : undefined;

  const { data: rawConversionRate } = useReadContract({
    address: oftAddress,
    abi: oftConversionRateAbi,
    functionName: "decimalConversionRate",
    chainId: sourceChainId,
    query: { enabled: !!oftAddress, refetchInterval: 60_000, retry: 3, retryDelay: 2000 },
  });

  // decimalConversionRate: for 6-decimal USDC with 6 shared decimals, rate = 1 (no dust)
  const dustRate = rawConversionRate ? BigInt(rawConversionRate as bigint) : 1n;

  // --- Compose msg from on-chain buildComposeMsg ---
  const {
    composeMsg: authorativeComposeMsg,
    isLoading: isComposeLoading,
  } = useComposeMsg({
    sourceChainId,
    destChainId,
    tokenKey,
    amount,
    dappId,
    address,
    recipientAddress: recipientAddress || undefined,
    direction,
    feeBps,
    dustRate,
    feeMode,
    flatFee,
  });

  // --- LZ fee quote (self-bridge mode, uses authoritative compose msg) ---
  const {
    nativeFee: lzNativeFee,
    nativeFeeFormatted: lzFeeFormatted,
    protocolFee: onChainProtocolFee,
    isLoading: isLzQuoteLoading,
    isError: isLzQuoteError,
    debug: lzQuoteDebug,
  } = useLzQuote({
    sourceChainId,
    destChainId,
    tokenKey,
    amount,
    dappId,
    address,
    recipientAddress: recipientAddress || undefined,
    direction,
    composeMsg: authorativeComposeMsg,
    // Always run quote to get on-chain protocolFee for display; self-bridge also needs lzNativeFee
    enabled: !!address && !!amount && parseFloat(amount) > 0
      // Wait for compose msg before quoting — contract reverts on empty compose for dappId > 0
      && (dappId === 0 || !isDeposit || (authorativeComposeMsg !== "0x" && !isComposeLoading)),
  });

  // --- Rate limit bucket (withdrawals only) ---
  const { data: rateLimitBucket } = useReadContract({
    address: globalWithdrawAddr,
    abi: riseGlobalWithdrawAbi,
    functionName: "getLaneRateLimitBucket",
    args: destLzEid ? [destLzEid] : undefined,
    chainId: sourceChainId,
    query: { enabled: !isDeposit && !!globalWithdrawAddr && !!destLzEid, refetchInterval: 10_000, retry: 3, retryDelay: 2000 },
  });

  const rateLimitInfo = rateLimitBucket && (rateLimitBucket as { enabled: boolean }).enabled
    ? {
        available: BigInt((rateLimitBucket as { available: bigint }).available),
        capacity: BigInt((rateLimitBucket as { capacity: bigint }).capacity),
      }
    : null;

  // Withdraw router lane limits are USD-denominated with 18 decimals.
  const rateLimitLabel = rateLimitInfo && token
    ? `${Number(formatUnits(rateLimitInfo.available, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/${Number(formatUnits(rateLimitInfo.capacity, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD`
    : undefined;

  const routePoolLimitContracts = useMemo(() => {
    if (isNative) return [];
    const contracts = [];
    if (srcRouteToken?.oft) {
      contracts.push({
        address: srcRouteToken.oft as Address,
        abi: oftRateLimitAbi,
        functionName: "getOutboundRateLimitBucket" as const,
        args: [dstEid] as const,
        chainId: sourceChainId,
      });
    }
    if (dstRouteToken?.oft) {
      contracts.push({
        address: dstRouteToken.oft as Address,
        abi: oftRateLimitAbi,
        functionName: "getInboundRateLimitBucket" as const,
        args: [srcEid] as const,
        chainId: destChainId,
      });
    }
    return contracts;
  }, [destChainId, dstEid, dstRouteToken?.oft, isNative, sourceChainId, srcEid, srcRouteToken?.oft]);

  const { data: routePoolLimitData } = useReadContracts({
    contracts: routePoolLimitContracts,
    query: {
      enabled: routePoolLimitContracts.length > 0,
      refetchInterval: 10_000,
      retry: 3,
      retryDelay: 2000,
    },
  });

  const sourcePoolLimitIndex = srcRouteToken?.oft ? 0 : -1;
  const destinationPoolLimitIndex = dstRouteToken?.oft ? (srcRouteToken?.oft ? 1 : 0) : -1;
  const sourcePoolBucket = sourcePoolLimitIndex >= 0 && routePoolLimitData?.[sourcePoolLimitIndex]?.status === "success"
    ? routePoolLimitData[sourcePoolLimitIndex].result as RateLimitBucket
    : undefined;
  const destinationPoolBucket = destinationPoolLimitIndex >= 0 && routePoolLimitData?.[destinationPoolLimitIndex]?.status === "success"
    ? routePoolLimitData[destinationPoolLimitIndex].result as RateLimitBucket
    : undefined;

  const rateLimitSummaries = useMemo<RateLimitSummary[]>(() => {
    const summaries: RateLimitSummary[] = [];
    const sourceLabel = CHAINS[sourceChainId]?.shortLabel ?? "Source";
    const destinationLabel = CHAINS[destChainId]?.shortLabel ?? "Destination";
    const tokenSymbol = token?.symbol ?? selectedDynamicToken?.symbol ?? "token";
    const tokenDecimals = token?.decimals ?? selectedDynamicToken?.decimals ?? 6;

    if (!isDeposit && rateLimitBucket) {
      const bucket = rateLimitBucket as RateLimitBucket;
      summaries.push({
        label: `${sourceLabel} router lane`,
        enabled: bucket.enabled,
        availableLabel: compactAmount(bucket.available, 18, "USD"),
        capacityLabel: compactAmount(bucket.capacity, 18, "USD"),
        low: bucket.enabled && bucket.capacity > 0n && bucket.available * 5n < bucket.capacity,
      });
    }

    if (sourcePoolBucket) {
      summaries.push({
        label: `${sourceLabel} pool outbound`,
        enabled: sourcePoolBucket.enabled,
        availableLabel: compactAmount(sourcePoolBucket.available, tokenDecimals, tokenSymbol),
        capacityLabel: compactAmount(sourcePoolBucket.capacity, tokenDecimals, tokenSymbol),
        low: sourcePoolBucket.enabled && sourcePoolBucket.capacity > 0n && sourcePoolBucket.available * 5n < sourcePoolBucket.capacity,
      });
    }

    if (destinationPoolBucket) {
      summaries.push({
        label: `${destinationLabel} pool inbound`,
        enabled: destinationPoolBucket.enabled,
        availableLabel: compactAmount(destinationPoolBucket.available, tokenDecimals, dstRouteToken?.symbol ?? tokenSymbol),
        capacityLabel: compactAmount(destinationPoolBucket.capacity, tokenDecimals, dstRouteToken?.symbol ?? tokenSymbol),
        low: destinationPoolBucket.enabled && destinationPoolBucket.capacity > 0n && destinationPoolBucket.available * 5n < destinationPoolBucket.capacity,
      });
    }

    if (isDeposit && summaries.length === 0) {
      summaries.push({
        label: `${sourceLabel} deposit router`,
        enabled: false,
      });
    }

    return summaries;
  }, [
    destChainId,
    destinationPoolBucket,
    dstRouteToken?.symbol,
    isDeposit,
    rateLimitBucket,
    selectedDynamicToken?.decimals,
    selectedDynamicToken?.symbol,
    sourceChainId,
    sourcePoolBucket,
    token?.decimals,
    token?.symbol,
  ]);

  // --- Lane pause check (withdrawals only) ---
  const { data: isLanePaused } = useReadContract({
    address: globalWithdrawAddr,
    abi: riseGlobalWithdrawAbi,
    functionName: "isLanePaused",
    args: destLzEid ? [destLzEid] : undefined,
    chainId: sourceChainId,
    query: { enabled: !isDeposit && !!globalWithdrawAddr && !!destLzEid, refetchInterval: 30_000, retry: 3, retryDelay: 2000 },
  });

  // --- Check deposit address balance (kept for on-chain polling visibility) ---
  useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: depositAddress ? [depositAddress as Address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!depositAddress && !!tokenAddress && step === "transfer", refetchInterval: 8_000, retry: 3, retryDelay: 2000 },
  });

  // --- Token transfer ---
  const {
    writeContract: writeTransfer,
    data: transferHash,
    isPending: isTransferPending,
    error: transferError,
    reset: resetTransfer,
  } = useWriteContract();

  const { isLoading: isWaitingForTx, isSuccess: isTxMinedRaw } =
    useWaitForTransactionReceipt({
      hash: transferHash,
      chainId: sourceChainId,
    });

  // Transfer is "done" either from the live wagmi receipt OR from persisted session status
  // (wagmi state is lost on page reload, but session status persists in localStorage)
  const transferDone = isTxMinedRaw || (
    !!activeSession?.userTransferTxHash &&
    (activeSession.status === "transfer_mined" || activeSession.status === "deposit_verified")
  );

  // Handle transfer error
  useEffect(() => {
    if (transferError) {
      const msg = transferError.message ?? "Transfer failed";
      // Map known contract errors
      for (const [key, friendly] of Object.entries(CONTRACT_ERROR_MAP)) {
        if (msg.includes(key)) {
          setError(friendly);
          return;
        }
      }
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    }
  }, [transferError]);

  // Create session when transfer hash is received (= user actually sent the tx)
  useEffect(() => {
    if (!transferHash || !address || !depositAddress) return;

    // If there's already an active session with this hash, just update it
    if (activeSession?.userTransferTxHash === transferHash) return;

    // If we already have an active session but no hash yet, update it
    if (activeSession && !activeSession.userTransferTxHash) {
      updateSession(activeSession.id, {
        userTransferTxHash: transferHash,
        status: "transfer_submitted",
      });
      return;
    }

    // Otherwise create the session now (first time a tx hash appears)
    const session = createSession({
      userAddress: address,
      recipientAddress: recipientAddress || address,
      depositAddress,
    });
    updateSession(session.id, {
      userTransferTxHash: transferHash,
      status: "transfer_submitted",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferHash]);

  // When tx mined, update session status. Job detection is handled by useVaultStatus.
  useEffect(() => {
    if (isTxMinedRaw && activeSession) {
      updateSession(activeSession.id, { status: "transfer_mined" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxMinedRaw]);

  const startPolling = useCallback(
    (jobId: string, sessionId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const res = await pollBridgeStatus(jobId, network);
          const mappedStatus = mapBackendStatus(res.status);

          // Extract tx hashes from transactions array
          const userFundTx = res.transactions?.find(t => t.txType === "user_fund");
          const operatorBridgeTx = res.transactions?.find(t => t.txType === "operator_bridge");
          const bridgeTxHash = operatorBridgeTx?.txHash;

          const sessionUpdates: Partial<BridgeSession> = {
            status: mappedStatus,
            backendProcessTxHash: bridgeTxHash,
            error: res.error ?? undefined,
          };

          updateSession(sessionId, sessionUpdates);

          // Once we have a bridge tx hash, start LZ polling for cross-chain status
          if (bridgeTxHash && !lzPollingRef.current) {
            const sessionDappId = useBridgeStore.getState().activeSession?.dappId ?? 0;
            startLzPolling(bridgeTxHash, sessionId, sessionDappId);
          }

          if (isTerminalStatus(res.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;

            if (res.status === "failed") {
              setError(res.error ?? "Bridge job failed");
            }
          }
        } catch {
          // Polling error, will retry on next tick
        }
      }, 4000);
    },
    [updateSession]
  );

  // --- Vault status subscription (WS with poll fallback) ---
  // Active during the "transfer" step when the user hasn't sent via the connected wallet.
  // Auto-detects when the backend picks up a transfer to the vault (QR code / external wallet flow).
  const vaultStatusEnabled = step === "transfer" && !!depositAddress && !!tokenAddress;
  useVaultStatus({
    eid: srcEid,
    vaultAddress: depositAddress ?? "",
    token: tokenAddress ?? "",
    network,
    enabled: vaultStatusEnabled,
    onJobDetected: useCallback((resp: import("@/lib/bridge-service").VaultStatusResponse) => {
      if (!activeSession || !resp.jobId) return;
      updateSession(activeSession.id, {
        status: mapBackendStatus(resp.status),
        jobId: resp.jobId,
        userTransferTxHash: resp.txHash,
      });
      startPolling(resp.jobId, activeSession.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSession?.id, startPolling, updateSession]),
  });

  /** Poll LZ Scan directly for self-bridge sessions (no backend involvement) */
  const startLzPolling = useCallback(
    (txHash: string, sessionId: string, sessionDappId: number) => {
      if (lzPollingRef.current) clearInterval(lzPollingRef.current);

      // Poll every 6s (LZ indexing can take 30-120s after tx mines)
      lzPollingRef.current = setInterval(async () => {
        try {
          const snapshot = await pollLzScan(txHash, network);
          if (!snapshot) return; // Not indexed yet, keep polling

          const lzStatus = snapshot.lzStatus ?? "";
          let mappedStatus: BridgeStatus = "lz_pending";

          if (lzStatus === "lz_delivered") {
            // Direct bridge (dappId=0): no compose step — delivery = complete
            const needsCompose = sessionDappId > 0;

            if (!needsCompose) {
              mappedStatus = "completed";
            } else {
              const cs = snapshot.composeStatus?.toUpperCase() ?? "";
              if (cs === "SUCCEEDED" || cs === "EXECUTED") {
                // Round-trip dapps: compose succeeded but need to track the return bridge
                if (isDappRoundTrip(bridgeConfig, sessionDappId) || isRoundTripFallback(sessionDappId)) {
                  mappedStatus = "roundtrip_pending";
                } else {
                  mappedStatus = "completed";
                }
              } else if (cs === "FAILED") {
                mappedStatus = "failed";
              } else {
                mappedStatus = "destination_confirmed";
              }
            }
          } else if (lzStatus === "lz_inflight") {
            mappedStatus = "lz_pending";
          } else if (lzStatus === "lz_failed" || lzStatus === "lz_blocked") {
            mappedStatus = "failed";
          } else if (lzStatus === "lz_pending") {
            mappedStatus = "lz_indexing";
          }

          // Don't let LZ polling downgrade an already-completed session.
          // Backend polling may have set "completed" before LZ Scan indexes compose status.
          // Keep polling to enrich lzTracking data (guid, dstTxHash, compose) — just don't touch status.
          // Exception: roundtrip_pending MUST override "completed" (leg 1 done, leg 2 starting).
          const currentStatus = useBridgeStore.getState().activeSession?.status;
          const isAlreadyComplete = currentStatus === "completed" && mappedStatus !== "roundtrip_pending";

          updateSession(sessionId, {
            ...(isAlreadyComplete ? {} : { status: mappedStatus }),
            lzTracking: snapshot,
            lzMessageId: snapshot.guid,
            destinationTxHash: snapshot.dstTxHash,
          });

          // LZ-terminal: delivered (+ compose resolved for dapp bridges), or failed
          const isLzTerminal =
            mappedStatus === "completed" ||
            mappedStatus === "failed" ||
            mappedStatus === "roundtrip_pending" ||
            // For already-completed sessions: stop once LZ itself is delivered and compose is resolved
            (isAlreadyComplete && lzStatus === "lz_delivered" && (
              sessionDappId === 0 ||
              ["SUCCEEDED", "EXECUTED", "FAILED"].includes(snapshot.composeStatus?.toUpperCase() ?? "")
            ));

          if (isLzTerminal) {
            if (lzPollingRef.current) clearInterval(lzPollingRef.current);
            lzPollingRef.current = null;

            if (mappedStatus === "failed" && !isAlreadyComplete) {
              const cs = snapshot.composeStatus?.toUpperCase() ?? "";
              if (sessionDappId > 0 && cs === "FAILED") {
                setError("lzCompose failed on destination chain.");
              } else {
                setError("LZ message delivery failed.");
              }
            }

            // Start return-leg tracking for round-trip dapps
            if (mappedStatus === "roundtrip_pending" && snapshot.composeTxHash) {
              startReturnLegPolling(snapshot.composeTxHash, sessionId);
            }
          }
        } catch {
          // Polling error, will retry on next tick
        }
      }, 6000);
    },
    [updateSession]
  );

  /**
   * Round-trip return-leg polling (dappId 2).
   * Phase 1: Poll backend by compose TX hash until the return withdrawal job is found.
   * Phase 2: Poll LZ Scan for the return bridge TX until delivered on home.
   */
  const startReturnLegPolling = useCallback(
    (composeTxHash: string, sessionId: string) => {
      if (returnLegRef.current) clearInterval(returnLegRef.current);

      let phase: "find_job" | "poll_lz" = "find_job";
      let returnBridgeTxHash: string | undefined;

      returnLegRef.current = setInterval(async () => {
        try {
          if (phase === "find_job") {
            // Look up the return withdrawal job by the compose TX hash.
            // The backend auto-creates this when ERC20TransferConsumer detects
            // the share transfer to the vault clone.
            const result = await lookupByTxHash(composeTxHash, network);
            if (!result) return; // Not created yet, keep polling

            updateSession(sessionId, {
              returnLeg: {
                jobId: result.job_id,
                bridgeTxHash: result.bridge_tx_hash || undefined,
              },
            });

            // If the return job already failed, stop polling
            if (result.status === "failed") {
              updateSession(sessionId, { status: "failed" });
              setError("Return bridge failed. Check the job in backend logs.");
              if (returnLegRef.current) clearInterval(returnLegRef.current);
              returnLegRef.current = null;
              return;
            }

            if (!result.bridge_tx_hash) {
              // Job exists but no bridge TX yet — update status, keep polling
              updateSession(sessionId, { status: "roundtrip_bridging" });
              return;
            }

            returnBridgeTxHash = result.bridge_tx_hash;
            updateSession(sessionId, { status: "roundtrip_bridging" });
            phase = "poll_lz";
          }

          if (phase === "poll_lz" && returnBridgeTxHash) {
            const snapshot = await pollLzScan(returnBridgeTxHash, network);
            if (!snapshot) return; // Not indexed yet

            const lzStatus = snapshot.lzStatus ?? "";
            let status: BridgeStatus = "roundtrip_bridging";

            if (lzStatus === "lz_delivered") {
              status = "roundtrip_completed";
            } else if (lzStatus === "lz_inflight") {
              status = "roundtrip_inflight";
            } else if (lzStatus === "lz_failed" || lzStatus === "lz_blocked") {
              status = "failed";
            }

            updateSession(sessionId, {
              status,
              returnLeg: { lzTracking: snapshot },
            });

            if (status === "roundtrip_completed" || status === "failed") {
              if (returnLegRef.current) clearInterval(returnLegRef.current);
              returnLegRef.current = null;
              if (status === "failed") {
                setError("Return bridge delivery failed.");
              }
            }
          }
        } catch {
          // Polling error, will retry on next tick
        }
      }, 6000);
    },
    [updateSession, network]
  );

  // --- Handlers ---

  /** Execute the self-bridge deposit()/withdraw() contract call.
   *  Session creation/update happens in the selfBridgeHash useEffect (when wallet confirms). */
  const handleSelfBridge = useCallback(async (permitData?: {
    permitType: number;
    target: Address;
    deadline: bigint;
    nonce: bigint;
    signature: `0x${string}`;
  }) => {
    if (!address || !tokenAddress || !amount || !token || !lzNativeFee) return;
    setError(null);

    const parsedAmt = parseUnits(amount, token.decimals);
    const dstAddr = (recipientAddress || address) as Address;

    // Use authoritative compose msg (on-chain verified when available)
    const composeMsgHex = authorativeComposeMsg as `0x${string}`;

    const permit = permitData ?? {
      permitType: 0, // VaultFunded
      target: "0x0000000000000000000000000000000000000000" as Address,
      deadline: 0n,
      nonce: 0n,
      signature: "0x" as `0x${string}`,
    };

    if (isDeposit) {
      writeSelfBridge({
        address: routerAddr!,
        abi: riseGlobalDepositAbi,
        functionName: "deposit",
        args: [{
          srcAddress: address,
          dstAddress: dstAddr,
          amount: parsedAmt,
          composeMsg: composeMsgHex,
          nativeFee: lzNativeFee,
          permit,
        }, tokenAddress, dappId],
        chainId: sourceChainId,
        value: lzNativeFee,
      });
    } else {
      writeSelfBridge({
        address: routerAddr!,
        abi: riseGlobalWithdrawAbi,
        functionName: "withdraw",
        args: [{
          srcAddress: address,
          dstAddress: dstAddr,
          amount: parsedAmt,
          nativeFee: lzNativeFee,
          permit,
        }, tokenAddress, destLzEid!],
        chainId: sourceChainId,
        value: lzNativeFee,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenAddress, amount, token, lzNativeFee, recipientAddress, isDeposit, dappId, authorativeComposeMsg, routerAddr, sourceChainId, destLzEid]);

  /** Handle Permit2 sign + self-bridge in one flow */
  const handlePermit2Bridge = useCallback(async () => {
    if (!address || !tokenAddress || !amount || !token || !routerAddr) return;
    setError(null);

    try {
      const parsedAmt = parseUnits(amount, token.decimals);
      const dstAddr = (recipientAddress || address) as Address;
      const routeParam = isDeposit ? dappId : (destLzEid ?? 0);

      const fee = onChainProtocolFee!;
      const net = parsedAmt > fee ? parsedAmt - fee : 0n;

      const permitData = await permit2.signPermit({
        amount: parsedAmt,
        spender: routerAddr,
        srcAddress: address,
        dstAddress: dstAddr,
        routeParam,
        feeAmount: fee,
        netAmount: net,
      });

      await handleSelfBridge(permitData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Permit2 signing failed";
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenAddress, amount, token, routerAddr, recipientAddress, isDeposit, dappId, destLzEid, onChainProtocolFee, permit2.signPermit, handleSelfBridge]);

  /** Operator + Permit2: sign permit, then send to backend for processing */
  const handleOperatorPermit2 = useCallback(async () => {
    if (showBridgeDebug) console.log("[operator-permit2] guard:", { address: !!address, tokenAddress: !!tokenAddress, amount: !!amount, token: !!token, routerAddr: !!routerAddr, onChainProtocolFee: String(onChainProtocolFee) });
    if (!address || !tokenAddress || !amount || !token || !routerAddr || !onChainProtocolFee) {
      if (showBridgeDebug) console.log("[operator-permit2] BLOCKED");
      return;
    }
    if (showBridgeDebug) console.log("[operator-permit2] proceeding to sign");
    setError(null);
    setIsPermitSubmitting(true);

    try {
      const parsedAmt = parseUnits(amount, token.decimals);
      const dstAddr = (recipientAddress || address) as Address;
      const routeParam = isDeposit ? dappId : (destLzEid ?? 0);

      // Step 1: Sign the permit (wallet popup)
      const fee = onChainProtocolFee;
      const net = parsedAmt > fee ? parsedAmt - fee : 0n;

      const permitData = await permit2.signPermit({
        amount: parsedAmt,
        spender: routerAddr,
        srcAddress: address,
        dstAddress: dstAddr,
        routeParam,
        feeAmount: fee,
        netAmount: net,
      });

      // Step 2: Submit to backend BEFORE creating session.
      // Creating session first would set status="awaiting_transfer" which shows
      // the vault-funded "Send" UI — wrong for permit2 which has no transfer step.
      const res = await submitPermit({
        srcEid: chainIdToEid(sourceChainId),
        dstEid: chainIdToEid(destChainId),
        token: tokenAddress,
        sender: address,
        receiver: dstAddr,
        amount: parsedAmt.toString(),
        dappId,
        permit: {
          target: permitData.target,
          deadline: permitData.deadline.toString(),
          nonce: permitData.nonce.toString(),
          signature: permitData.signature,
        },
      }, network);

      // Step 3: Create session with jobId already set → goes straight to "polling" step
      const session = createSession({
        userAddress: address,
        recipientAddress: dstAddr,
        depositAddress: depositAddress || address,
      });

      updateSession(session.id, {
        status: mapBackendStatus(res.status),
        jobId: res.jobId,
        userTransferTxHash: "permit2",
      });

      startPolling(res.jobId, session.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Permit2 signing failed";
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    } finally {
      setIsPermitSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenAddress, amount, token, routerAddr, depositAddress, recipientAddress, isDeposit, dappId, destLzEid, sourceChainId, destChainId, onChainProtocolFee, permit2.signPermit]);

  /** Self-bridge + EIP-2612: sign token permit and bridge in one flow */
  const handleEIP2612Bridge = useCallback(async () => {
    if (!address || !tokenAddress || !amount || !token || !routerAddr) return;
    setError(null);

    try {
      const parsedAmt = parseUnits(amount, token.decimals);

      const permitData = await eip2612.signPermit({
        amount: parsedAmt,
        spender: routerAddr,
      });

      await handleSelfBridge(permitData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "EIP-2612 signing failed";
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenAddress, amount, token, routerAddr, eip2612.signPermit, handleSelfBridge]);

  /** Operator + EIP-2612: sign token permit, send to backend */
  const handleOperatorEIP2612 = useCallback(async () => {
    if (!address || !tokenAddress || !amount || !token || !routerAddr) return;
    setError(null);
    setIsPermitSubmitting(true);

    try {
      const parsedAmt = parseUnits(amount, token.decimals);
      const dstAddr = (recipientAddress || address) as Address;

      const permitData = await eip2612.signPermit({
        amount: parsedAmt,
        spender: routerAddr,
      });

      const res = await submitPermit({
        srcEid: chainIdToEid(sourceChainId),
        dstEid: chainIdToEid(destChainId),
        token: tokenAddress,
        sender: address,
        receiver: dstAddr,
        amount: parsedAmt.toString(),
        dappId,
        permit: {
          type: 3,
          deadline: permitData.deadline.toString(),
          signature: permitData.signature,
        },
      }, network);

      const session = createSession({
        userAddress: address,
        recipientAddress: dstAddr,
        depositAddress: depositAddress || address,
      });

      updateSession(session.id, {
        status: mapBackendStatus(res.status),
        jobId: res.jobId,
        userTransferTxHash: "permit",
      });

      startPolling(res.jobId, session.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "EIP-2612 signing failed";
      setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
    } finally {
      setIsPermitSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, tokenAddress, amount, token, routerAddr, depositAddress, recipientAddress, dappId, sourceChainId, destChainId, eip2612.signPermit]);

  const handleInitiateBridge = () => {
    if (!address) return;
    setError(null);

    // Check if user is on the right chain
    if (walletChainId !== sourceChainId) {
      switchChain({ chainId: sourceChainId });
      return;
    }

    // Self-bridge + EIP-2612: sign token permit and bridge in one flow
    if (isSelfBridge && isEIP2612) {
      handleEIP2612Bridge();
      return;
    }

    // Operator + EIP-2612: sign permit, send to backend
    if (!isSelfBridge && isEIP2612) {
      handleOperatorEIP2612();
      return;
    }

    // Self-bridge + Permit2: sign and bridge in one flow
    if (isSelfBridge && isPermit2) {
      handlePermit2Bridge();
      return;
    }

    // Operator + Permit2: sign permit, send to backend
    // Does NOT require depositAddress — backend pulls tokens directly via permit2
    if (!isSelfBridge && isPermit2) {
      if (showBridgeDebug) console.log("[initiate] -> handleOperatorPermit2");
      handleOperatorPermit2();
      return;
    }

    // VaultFunded (both modes): requires deposit address for vault transfer
    if (!depositAddress) return;
    resetTransfer();
    resetSelfBridge();
    createSession({
      userAddress: address,
      recipientAddress: recipientAddress || address,
      depositAddress,
    });
  };

  const handleCancelTransfer = () => {
    setError(null);
    resetTransfer();
    resetSelfBridge();
    setActiveSession(null);
  };

  const handleSendTransfer = () => {
    if (!tokenAddress || !depositAddress || !amount || !token) return;
    // Prevent double-send: don't send if already submitted or mined
    if (transferHash || transferDone) return;
    setError(null);

    const parsedAmount = parseUnits(amount, token.decimals);

    writeTransfer({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "transfer",
      args: [depositAddress as Address, parsedAmount],
      chainId: sourceChainId,
    });
  };

  const handleRetry = () => {
    setError(null);

    // Reset to form so user can re-submit
    if (activeSession) {
      updateSession(activeSession.id, { status: "idle" });
    }
    resetForm();
  };

  const handleCopyDeposit = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      setDepositCopied(true);
      setTimeout(() => setDepositCopied(false), 2000);
    }
  };

  /** Submit a manually pasted tx hash for operator vault-funded processing.
   *  Verifies the tx receipt on-chain before submitting to the backend:
   *  - Tx must be mined (have a receipt)
   *  - Tx must be successful (status = 1)
   *  - Receipt must contain an ERC20 Transfer log to the vault address */
  const handleManualTxHash = useCallback(async () => {
    const hash = manualTxHash.trim() as `0x${string}`;
    if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setError("Invalid tx hash. Must be a 66-character hex string (0x...).");
      return;
    }
    if (!activeSession || !address || !depositAddress || !publicClient) return;

    setError(null);
    setIsSubmittingManual(true);

    // ERC20 Transfer(address,address,uint256) event topic
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    try {
      // 1. Fetch tx receipt from source chain
      const receipt = await publicClient.getTransactionReceipt({ hash });

      if (!receipt) {
        setError("Transaction not found. Make sure the hash is correct and the tx is mined.");
        setIsSubmittingManual(false);
        return;
      }

      if (receipt.status !== "success") {
        setError("Transaction reverted on-chain. Cannot use a failed transaction.");
        setIsSubmittingManual(false);
        return;
      }

      // 2. Check for ERC20 Transfer log to the vault address
      const vaultLower = depositAddress.toLowerCase();
      const hasTransferToVault = receipt.logs.some((log) => {
        if (log.topics[0] !== TRANSFER_TOPIC) return false;
        // topics[2] = `to` address (zero-padded to 32 bytes)
        const toTopic = log.topics[2];
        if (!toTopic) return false;
        const toAddr = ("0x" + toTopic.slice(26)).toLowerCase();
        return toAddr === vaultLower;
      });

      if (!hasTransferToVault) {
        setError(
          `No ERC20 transfer to vault ${depositAddress.slice(0, 6)}...${depositAddress.slice(-4)} found in this tx. Verify you sent tokens to the correct vault address.`
        );
        setIsSubmittingManual(false);
        return;
      }

      // 3. Tx verified — update session
      updateSession(activeSession.id, {
        userTransferTxHash: hash,
        status: "transfer_mined",
      });

      const indexed = await waitForIndexedLzJob(
        hash,
        network,
        lzJobCriteriaForSession(activeSession, tokenAddress ?? undefined, token?.decimals),
      );
      if (!indexed?.job_id) {
        setError("Transfer confirmed. Waiting for the indexer to create the bridge job; search by tx hash shortly.");
        setManualTxHash("");
        return;
      }

      updateSession(activeSession.id, {
        status: mapBackendStatus(indexed.status ?? "pending"),
        jobId: indexed.job_id,
      });

      startPolling(indexed.job_id, activeSession.id);
      setManualTxHash("");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Verification failed";
      // Don't mark session as error if it's just a validation failure
      if (activeSession.status === "awaiting_transfer") {
        setError(errMsg.length > 200 ? errMsg.slice(0, 200) + "..." : errMsg);
      } else {
        updateSession(activeSession.id, { status: "error", error: errMsg });
        setError(errMsg.length > 200 ? errMsg.slice(0, 200) + "..." : errMsg);
      }
    } finally {
      setIsSubmittingManual(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualTxHash, activeSession, address, depositAddress, publicClient, authorativeComposeMsg]);

  // Available routes for the current network — drives chain selectors
  const routes = useMemo(() => BRIDGE_ROUTES_BY_NETWORK[network] ?? [], [network]);
  const availableSourceChains = useMemo(() => {
    const ids = [...new Set(routes.map((r) => r.sourceChainId))];
    return ids.map((id) => CHAINS[id]).filter(Boolean);
  }, [routes]);
  const availableDestChains = useMemo(() => {
    return routes
      .filter((r) => r.sourceChainId === sourceChainId)
      .map((r) => CHAINS[r.destChainId])
      .filter(Boolean);
  }, [routes, sourceChainId]);

  const handleSourceChainChange = useCallback((chainId: string) => {
    const id = Number(chainId);
    setSourceChainId(id);
    // Auto-select the first matching destination
    const match = routes.find((r) => r.sourceChainId === id);
    if (match) setDestChainId(match.destChainId);
    setDepositAddress(""); // reset vault address
    setError(null);
  }, [routes, setSourceChainId, setDestChainId, setDepositAddress]);

  const handleDestChainChange = useCallback((chainId: string) => {
    setDestChainId(Number(chainId));
    setDepositAddress("");
    setError(null);
  }, [setDestChainId, setDepositAddress]);

  const handleSwapDirection = () => {
    setError(null);
    swapDirection();
  };

  const currentStatus: BridgeStatus = activeSession?.status ?? "idle";
  const sourceChain = CHAINS[sourceChainId];
  const destChain = CHAINS[destChainId];

  // Data-driven flag: show tracking view whenever the session has a jobId or self-bridge tx
  // For self-bridge + vault-funded: don't show tracking until the bridge tx is submitted
  // (the user needs to see the "Complete Bridge" button after the vault transfer mines)
  // Also covers sessions where the user funded the vault but hasn't bridged yet
  // (no selfBridgeTxHash, no jobId, no backendProcessTxHash — nothing happened after funding)
  const isSelfVaultPending = !!(
    activeSession &&
    activeSession.bridgeMode === "self" &&
    activeSession.userTransferTxHash &&
    !activeSession.selfBridgeTxHash &&
    !activeSession.jobId &&
    !activeSession.backendProcessTxHash &&
    (activeSession.status === "transfer_mined" || activeSession.status === "deposit_verified")
  );

  // Operator mode: vault funded but backend hasn't picked it up yet
  const isOperatorVaultPending = !!(
    activeSession &&
    activeSession.bridgeMode !== "self" &&
    activeSession.userTransferTxHash &&
    !activeSession.jobId &&
    !activeSession.backendProcessTxHash &&
    (activeSession.status === "transfer_mined" || activeSession.status === "deposit_verified")
  );

  // Dust amount warning
  const parsedAmount =
    amount && token ? parseUnits(amount || "0", token.decimals) : 0n;
  const isDustWarning = parsedAmount > 0n && parsedAmount < 1000n;

  // Fee exceeds amount check — flat fee mode: amount must be > flatFee
  const isFeeExceedsAmount = !isFeeExempt && feeMode === 1 && parsedAmount > 0n && flatFee >= parsedAmount;

  // Rate limit exceeded check. Router buckets are USD WAD, while OFT pool buckets are token units.
  const isUsdLikeToken = (token?.symbol ?? "").toUpperCase().startsWith("USDC");
  const parsedAmountAsUsdWad = token && token.decimals <= 18
    ? parsedAmount * (10n ** BigInt(18 - token.decimals))
    : 0n;
  const isRouterRateLimitExceeded =
    !isDeposit &&
    isUsdLikeToken &&
    rateLimitInfo &&
    parsedAmountAsUsdWad > 0n &&
    parsedAmountAsUsdWad > rateLimitInfo.available;
  const isSourcePoolRateLimitExceeded =
    isEnabledBucket(sourcePoolBucket) &&
    parsedAmount > 0n &&
    parsedAmount > sourcePoolBucket.available;
  const isDestinationPoolRateLimitExceeded =
    isEnabledBucket(destinationPoolBucket) &&
    parsedAmount > 0n &&
    parsedAmount > destinationPoolBucket.available;
  const isRateLimitExceeded =
    !!isRouterRateLimitExceeded ||
    isSourcePoolRateLimitExceeded ||
    isDestinationPoolRateLimitExceeded;
  const rateLimitWarningLabel = isRouterRateLimitExceeded
    ? rateLimitLabel
    : isSourcePoolRateLimitExceeded && token
      ? compactAmount(sourcePoolBucket!.available, token.decimals, token.symbol)
      : isDestinationPoolRateLimitExceeded && token
        ? compactAmount(destinationPoolBucket!.available, token.decimals, dstRouteToken?.symbol ?? token.symbol)
        : rateLimitLabel;

  // Shared error + retry banner used in both form and transfer steps
  const renderErrorBanner = (message: string) => (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
      <div className="flex items-start gap-2 text-xs font-mono text-destructive-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
      <div className="flex gap-2">
        {activeSession?.userTransferTxHash && activeSession.bridgeMode !== "self" && !activeSession?.jobId ? (
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
            }}
            className="h-10 font-mono text-sm gap-2 flex-1 border-destructive/30 hover:bg-destructive/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Dismiss
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            setError(null);
            if (activeSession) {
              updateSession(activeSession.id, { status: "idle", error: undefined });
            }
            resetForm();
          }}
          className="h-10 font-mono text-sm gap-2 text-muted-foreground"
        >
          Start Over
        </Button>
      </div>
    </div>
  );

  // --- Render ---
  return (
    <div className="flex flex-col gap-4">
      {/* Status rail - visible when session has progressed past idle (not on form step).
          Hidden for native (OP Stack) sessions: the LZ stage list (Awaiting Transfer →
          ... → LZ Indexing → LZ Pending → Destination Confirmed) is meaningless for
          the native flow, which has its own phase machine surfaced by the
          NativePhaseTimeline inside TrackingCard. */}
      {step !== "form" && activeSession &&
        activeSession.bridgeKind !== "native" &&
        (activeSession.status !== "idle" || activeSession.jobId || activeSession.error) &&
        activeSession.status !== "awaiting_transfer" && (
        <div className="p-3 rounded-lg border border-border bg-card">
          <StatusRail
            currentStatus={(() => {
              if ((activeSession.dappId ?? 0) > 0 && isComposeFailed(activeSession)) return "failed" as const;
              if (activeSession.error && currentStatus === "idle") return "error" as const;
              return currentStatus;
            })()}
            error={(() => {
              if ((activeSession.dappId ?? 0) > 0 && isComposeFailed(activeSession)) return "lzCompose failed on destination chain";
              return activeSession.error ?? error ?? undefined;
            })()}
          />
        </div>
      )}

      {/* --- FORM STEP --- */}
      {step === "form" && (
        <div className="flex flex-col gap-4">
          {/* Source chain */}
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              From
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {availableSourceChains.length > 1 ? (
                <Select
                  value={String(sourceChainId)}
                  onValueChange={handleSourceChainChange}
                >
                  <SelectTrigger className="w-full sm:w-52 bg-muted/50 font-mono text-sm">
                    <span className="flex items-center gap-2">
                      <ChainIcon chainKey={sourceChain?.iconKey} className="h-4 w-4" />
                      {sourceChain?.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableSourceChains.map((c) => (
                      <SelectItem key={c.chain.id} value={String(c.chain.id)} className="font-mono text-sm">
                        <span className="flex items-center gap-2">
                          <ChainIcon chainKey={c.iconKey} className="h-4 w-4" />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-52 px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono">
                  <ChainIcon chainKey={sourceChain?.iconKey} className="h-4 w-4" />
                  <span>{sourceChain?.label}</span>
                </div>
              )}

              <Select
                value={tokenKey}
                onValueChange={setTokenKey}
              >
                <SelectTrigger className="w-full sm:w-36 bg-muted/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTokenKeys.map((k) => {
                    const dt = dynamicTokens.find((t) => t.key === k);
                    const symbol = dt?.symbol ?? TOKENS[k]?.symbol ?? k;
                    return (
                    <SelectItem
                      key={k}
                      value={k}
                      className="font-mono text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <TokenIcon tokenKey={k} className="h-4 w-4" />
                        {symbol}
                      </span>
                    </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Balance display */}
            {isConnected && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Balance
                </span>
                <span className="text-xs font-mono text-foreground">
                  {isBalanceReadLoading ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : formattedWalletBalance !== null ? (
                    <button
                      type="button"
                      onClick={() => setAmount(formattedWalletBalance)}
                      className="hover:text-primary transition-colors cursor-pointer"
                      title="Use max balance"
                    >
                      {Number(formattedWalletBalance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}{" "}
                      {token?.symbol}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </span>
              </div>
            )}

            {/* Amount input */}
            <div className="mt-2">
              <div className="relative">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setAmount(val);
                  }}
                  className="font-mono text-lg bg-muted/30 border-border h-12 pr-16"
                />
                {formattedWalletBalance && Number(formattedWalletBalance) > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(formattedWalletBalance)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase tracking-wider text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded bg-primary/10"
                  >
                    Max
                  </button>
                )}
              </div>
              {isDustWarning && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Amount may be too small after OFT dust removal
                </div>
              )}
            </div>
          </div>

          {/* Swap direction button */}
          <div className="flex justify-center -my-2 z-10">
            <button
              onClick={handleSwapDirection}
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200",
                "bg-card border-2 border-border hover:border-primary hover:bg-primary/10",
                "group"
              )}
              title={`Switch to ${isDeposit ? "Withdraw" : "Deposit"}`}
            >
              <ArrowUpDown className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </div>

          {/* Destination chain */}
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              To
            </label>
            {availableDestChains.length > 1 ? (
              <Select
                value={String(destChainId)}
                onValueChange={handleDestChainChange}
              >
                <SelectTrigger className="w-full sm:w-52 bg-muted/50 font-mono text-sm">
                  <span className="flex items-center gap-2">
                    <ChainIcon chainKey={destChain?.iconKey} className="h-4 w-4" />
                    {destChain?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {availableDestChains.map((c) => (
                    <SelectItem key={c.chain.id} value={String(c.chain.id)} className="font-mono text-sm">
                      <span className="flex items-center gap-2">
                        <ChainIcon chainKey={c.iconKey} className="h-4 w-4" />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-52 px-3 py-2 rounded-md bg-muted/50 border border-border text-sm font-mono">
                <ChainIcon chainKey={destChain?.iconKey} className="h-4 w-4" />
                <span>{destChain?.label}</span>
              </div>
            )}

            {/* Receive amount preview */}
            {amount && parseFloat(amount) > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  You Receive
                </span>
                <span className="text-xs font-mono text-foreground">
                  ~{(() => {
                    const parsed = parseFloat(amount);
                    if (isFeeExempt) return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                    if (isFeeExceedsAmount) return "0.00";
                    if (onChainProtocolFee !== undefined && token) {
                      const feeFloat = Number(onChainProtocolFee) / (10 ** token.decimals);
                      const net = parsed - feeFloat;
                      return (net > 0 ? net : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                    }
                    if (feeMode === 1 && token) {
                      const ff = Number(flatFee) / (10 ** token.decimals);
                      const net = parsed - ff;
                      return (net > 0 ? net : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                    }
                    return (parsed * (1 - Number(feeBps) / 10000)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                  })()}{" "}
                  {token?.symbol}
                </span>
              </div>
            )}

            {/* Recipient address toggle */}
            <div className="mt-3">
              {!showRecipient ? (
                <button
                  type="button"
                  onClick={() => setShowRecipient(true)}
                  className="text-[10px] font-mono uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
                >
                  + Custom Recipient
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Recipient Address
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRecipient(false);
                        setRecipientAddress("");
                      }}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Use own address
                    </button>
                  </div>
                  <Input
                    type="text"
                    placeholder={address ?? "0x..."}
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value.trim())}
                    className="font-mono text-xs bg-muted/30 border-border h-9"
                  />
                  {recipientAddress && !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress) && (
                    <span className="text-[10px] font-mono text-destructive-foreground">
                      Invalid address format
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* When ETH is selected, the form routes through the OP Stack
              native bridge — replace the LZ submit / transfer-mode / dapp
              subtree with NativeBridgeAction. The chain selectors, amount,
              and recipient inputs above are reused from the shared store. */}
          {isConnected && isNative && <NativeBridgeAction />}

          {/* Bridge Mode Toggle (LZ-only — hidden when token = ETH) */}
          {isConnected && !isNative && (
            <BridgeModeToggle
              bridgeMode={bridgeMode}
              onBridgeModeChange={setBridgeMode}
              transferMode={transferMode}
              onTransferModeChange={setTransferMode}
              showTransferMode={true}
              supportsEIP2612={eip2612.supportsEIP2612}
            />
          )}

          {/* LZ fee display (self-bridge mode) */}
          {isSelfBridge && isConnected && amount && parseFloat(amount) > 0 && (
            <div className="p-2.5 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  LZ Gas Fee
                </span>
                <span className="text-xs font-mono text-foreground">
                  {isLzQuoteLoading ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Quoting...
                    </span>
                  ) : lzFeeFormatted ? (
                    `${Number(lzFeeFormatted).toFixed(6)} ETH`
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60">
                Paid as msg.value when you submit the bridge tx
              </span>
            </div>
          )}

          {/* Permit2 approval (any mode with permit2 transfer) */}
          {isPermit2 && isConnected && permit2.needsApproval && !permit2.isApprovalConfirmed && (
            <div className="p-3 rounded-lg border border-warning/30 bg-warning/5">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-mono text-foreground">
                    Permit2 Approval Required
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    One-time approval to let Permit2 pull {token?.symbol}. After this, bridge with just a signature.
                  </span>
                </div>
              </div>
              {permit2.approvalError && (
                <div className="mb-2 p-2 rounded bg-destructive/10 border border-destructive/30">
                  <span className="text-[10px] font-mono text-destructive break-all">
                    {permit2.approvalError.message.length > 200
                      ? permit2.approvalError.message.slice(0, 200) + "..."
                      : permit2.approvalError.message}
                  </span>
                </div>
              )}
              <Button
                onClick={() => {
                  if (permit2.approvalError) permit2.resetApproval();
                  if (walletChainId !== sourceChainId) {
                    switchChain({ chainId: sourceChainId });
                    return;
                  }
                  permit2.approve();
                }}
                disabled={permit2.isApproving || permit2.isApprovalConfirming}
                className="w-full h-10 font-mono text-sm bg-warning text-warning-foreground hover:bg-warning/90"
              >
                {walletChainId !== sourceChainId ? (
                  `Switch to ${CHAINS[sourceChainId]?.label ?? "source chain"}`
                ) : permit2.isApproving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm in Wallet...
                  </span>
                ) : permit2.isApprovalConfirming ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming...
                  </span>
                ) : (
                  `Approve ${token?.symbol} for Permit2`
                )}
              </Button>
            </div>
          )}

          {/* Permit2 approval confirmed */}
          {isPermit2 && permit2.isApprovalConfirmed && (
            <div className="flex items-center gap-1.5 px-2.5 text-[10px] font-mono text-success">
              <Check className="h-3 w-3" />
              Permit2 approved
            </div>
          )}

          {/* Fee Summary */}
          {amount && parseFloat(amount) > 0 && (
            <FeeSummary
              feeBps={Number(feeBps)}
              feeExempt={!!isFeeExempt}
              amount={amount}
              tokenSymbol={token?.symbol ?? ""}
              direction={direction}
              lanePaused={!!isLanePaused}
              feeMode={feeMode}
              flatFee={flatFee}
              tokenDecimals={token?.decimals ?? 6}
              protocolFee={onChainProtocolFee}
              rateLimits={rateLimitSummaries}
            />
          )}

          {/* DEBUG: LZ Quote + Compose diagnostics — LZ-only */}
          {isConnected && !isNative && amount && parseFloat(amount) > 0 && (
            <details className="p-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
              <summary className="text-[10px] font-mono uppercase tracking-wider text-yellow-600 cursor-pointer">
                Debug: LZ Quote
              </summary>
              <pre className="mt-1 text-[9px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
{JSON.stringify({
  quote: {
    ...lzQuoteDebug,
    lzNativeFee: lzNativeFee?.toString() ?? "undefined",
    protocolFee: onChainProtocolFee?.toString() ?? "undefined",
    isLoading: isLzQuoteLoading,
    isError: isLzQuoteError,
  },
  compose: {
    composeMsg: authorativeComposeMsg?.slice(0, 40) + (authorativeComposeMsg && authorativeComposeMsg.length > 40 ? "..." : ""),
    isComposeLoading,
    dappId,
  },
  feeConfig: {
    feeBps: feeBps.toString(),
    feeMode,
    flatFee: flatFee.toString(),
    tokenFeeConfigLoaded: !!tokenFeeConfig,
    isFeeExempt: !!isFeeExempt,
  },
  bridge: {
    isSelfBridge,
    direction,
    dustRate: dustRate.toString(),
  },
}, null, 2)}
              </pre>
            </details>
          )}

          {/* Dapp selector (deposit-only, LZ-only) — drives compose routing
              on the destination chain (Direct Bridge / RISEx Perps / etc.).
              Native ETH bridges have no compose layer; the user just receives
              raw ETH at the recipient address. */}
          {isDeposit && isConnected && !isNative && (
            <DappSelector
              sourceChainId={sourceChainId}
              tokenAddress={tokenAddress}
              dappId={dappId}
              onDappChange={setDappId}
            />
          )}

          {/* Deposit address preview — only relevant for the LayerZero
              vault-funded flow (user transfers ERC20 to a CREATE2 vault that
              the operator sweeps). The native bridge sends ETH directly to
              L1StandardBridge.bridgeETHTo — no intermediate vault — so this
              block is hidden when ETH is selected. */}
          {isConnected && !isNative && (
            <div className="p-2.5 sm:p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {isDeposit ? "Deposit Address" : "Withdrawal Vault Address"}
                </span>
                {depositAddress && (
                  <button
                    onClick={handleCopyDeposit}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {depositCopied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
              {isComputingDeposit ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Computing address...
                  </span>
                </div>
              ) : isComputeError ? (
                <div className="flex items-center justify-between py-1">
                  <span className="font-mono text-xs text-destructive-foreground">
                    Failed to compute address
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retryComputeDeposit()}
                    className="h-6 px-2 text-[10px] font-mono gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              ) : depositAddress ? (
                <p className="font-mono text-xs text-foreground break-all leading-relaxed">
                  {depositAddress}
                </p>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">
                  Connect wallet to compute
                </span>
              )}
            </div>
          )}

          {/* On-chain compose verification badge */}
          {dappId > 0 && isDeposit && !isComposeLoading && authorativeComposeMsg !== "0x" && (
            <div className="flex items-center gap-1.5 px-2.5 text-[10px] font-mono text-muted-foreground">
              <Check className="h-3 w-3 text-success" />
              Compose msg verified on-chain
            </div>
          )}

          {/* Chain mismatch warning */}
          {isConnected && walletChainId !== sourceChainId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-warning/10 border border-warning/20 text-xs font-mono text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                Wrong network. Please switch to{" "}
                {sourceChain?.label ?? "source chain"}.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => switchChain({ chainId: sourceChainId })}
                className="h-6 px-2 text-[10px] font-mono ml-auto text-warning hover:text-warning"
              >
                Switch
              </Button>
            </div>
          )}

          {/* Rate limit exceeded warning */}
          {isRateLimitExceeded && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-warning/10 border border-warning/20 text-xs font-mono text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                Amount exceeds rate limit. Available: {rateLimitWarningLabel ?? "see route limits"}
              </span>
            </div>
          )}

          {/* Fee exceeds amount warning */}
          {isFeeExceedsAmount && token && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-warning/10 border border-warning/20 text-xs font-mono text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                Amount is below the flat fee ({(Number(flatFee) / (10 ** token.decimals)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {token.symbol}). Increase amount.
              </span>
            </div>
          )}

          {/* Blocklist warning */}
          {isBlocked && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-xs font-mono text-destructive-foreground">
              <Shield className="h-3 w-3 shrink-0" />
              <span>
                {isSenderBlocked && isRecipientBlocked
                  ? "Sender and recipient addresses are blocked."
                  : isSenderBlocked
                    ? "Your address is blocked from bridging."
                    : "Recipient address is blocked from bridging."}
              </span>
            </div>
          )}

          {/* Error banner + retry for failed backend processing */}
          {activeSession && (activeSession.status === "error" || activeSession.status === "failed") && (error || activeSession.error) &&
            renderErrorBanner(error || activeSession.error || "Bridge transaction failed.")
          }

          {/* DEBUG — LZ-only debug panel (permit2 / self-bridge state) */}
          {showBridgeDebug && !isNative && (
          <div className="text-[9px] text-yellow-400 p-1 bg-black/50 rounded font-mono">
            signing:{String(permit2.isSigning)} | submitting:{String(isPermitSubmitting)} |
            needsApproval:{String(permit2.needsApproval)} | approvedOk:{String(permit2.isApprovalConfirmed)} |
            allowance:{permit2.allowance?.toString() ?? "?"} | checkingAllowance:{String(permit2.isCheckingAllowance)} |
            selfBridgePending:{String(isSelfBridgePending)} | waitingSelf:{String(isWaitingSelfBridge)} |
            step:{step} | fee:{onChainProtocolFee?.toString() ?? "undef"}
          </div>
          )}
          {/* LZ Submit button — hidden when token = ETH; the OP Stack native
              flow renders its own action button via NativeBridgeAction above. */}
          {!isNative && (
          <Button
            onClick={() => { if (showBridgeDebug) console.log("[BTN CLICKED]"); handleInitiateBridge(); }}
            disabled={(() => {
              const checks = {
                noConn: !isConnected,
                noAmt: !amount,
                zeroAmt: !!(amount && parseFloat(amount) <= 0),
                noDeposit: !isPermitMode && !depositAddress,
                computing: !isPermitMode && isComputingDeposit,
                paused: !!isLanePaused,
                rateLimit: !!isRateLimitExceeded,
                blocked: isBlocked,
                feeExceeds: isFeeExceedsAmount,
                badRecip: !!(recipientAddress && !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)),
                lzLoading: isSelfBridge && (isLzQuoteLoading || isComposeLoading),
                noLzFee: isSelfBridge && !lzNativeFee,
                needsApproval: isPermit2 && permit2.needsApproval && !permit2.isApprovalConfirmed,
                selfPending: isSelfBridgePending,
                waitSelf: isWaitingSelfBridge,
                signing: permit2.isSigning || eip2612.isSigning,
                submitting: isPermitSubmitting,
              };
              const d = Object.values(checks).some(Boolean);
              if (showBridgeDebug && d) console.log("[BTN disabled] TRUE:", Object.entries(checks).filter(([,v]) => v).map(([k]) => k).join(", "));
              return d;
            })()}
            className={cn(
              "h-12 font-mono text-sm",
              isDeposit
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-chart-5 text-white hover:bg-chart-5/90"
            )}
          >
            {!isConnected ? (
              "Connect Wallet First"
            ) : !isPermitMode && isComputingDeposit ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Computing Address...
              </span>
            ) : !isPermitMode && isComputeError ? (
              "Address Error -- Retry Above"
            ) : !isPermitMode && !depositAddress ? (
              "Waiting for Address..."
            ) : isLanePaused ? (
              "Lane Paused"
            ) : isRateLimitExceeded ? (
              "Rate Limit Exceeded"
            ) : isFeeExceedsAmount ? (
              "Amount Below Minimum Fee"
            ) : isBlocked ? (
              "Address Blocked"
            ) : isSelfBridge && (isComposeLoading || isLzQuoteLoading) ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isComposeLoading ? "Building Compose Msg..." : "Quoting LZ Fee..."}
              </span>
            ) : isSelfBridge && isLzQuoteError ? (
              "LZ Quote Failed — Check Amount"
            ) : isSelfBridge && !lzNativeFee ? (
              "Waiting for LZ Quote..."
            ) : isPermit2 && permit2.needsApproval && !permit2.isApprovalConfirmed ? (
              "Approve Permit2 First"
            ) : eip2612.isSigning ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sign Token Permit...
              </span>
            ) : permit2.isSigning ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sign Permit2...
              </span>
            ) : isPermitSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </span>
            ) : isSelfBridgePending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirm Bridge Tx...
              </span>
            ) : isWaitingSelfBridge ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Bridge Tx Confirming...
              </span>
            ) : !amount || parseFloat(amount) <= 0 ? (
              "Enter Amount"
            ) : (
              <>
                {isPermit2 ? "Sign & " : ""}
                {isDeposit ? "Deposit" : "Withdraw"} {amount} {token?.symbol}
                {isSelfBridge ? " (Self Bridge)" : ""}
              </>
            )}
          </Button>
          )}
        </div>
      )}

      {/* --- TRANSFER STEP --- */}
      {step === "transfer" && (
        <div className="flex flex-col gap-4">
          {/* Session ID */}
          {activeSession && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50">
              <span>Session: {activeSession.id}</span>
              <span>|</span>
              {activeSession.bridgeKind === "native" ? (
                <span>Kind: OP Stack Native</span>
              ) : (
                <>
                  <span>Mode: {activeSession.bridgeMode}/{activeSession.transferMode}</span>
                  <span>|</span>
                  <span>Dapp: {activeSession.dappId ?? 0}</span>
                </>
              )}
            </div>
          )}
          <div className={cn(
            "p-4 rounded-lg border",
            isDeposit ? "border-primary/30 bg-primary/5" : "border-chart-5/30 bg-chart-5/5"
          )}>
            <div className="flex items-start gap-3">
              <Shield className={cn("h-5 w-5 mt-0.5 shrink-0", isDeposit ? "text-primary" : "text-chart-5")} />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-mono text-foreground">
                  Send {amount} {token?.symbol} to {isDeposit ? "deposit" : "withdrawal"} address
                </span>
                <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                  {depositAddress}
                </p>
                <button
                  onClick={handleCopyDeposit}
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-mono transition-colors mt-1 self-start",
                    isDeposit ? "text-primary hover:text-primary/80" : "text-chart-5 hover:text-chart-5/80"
                  )}
                >
                  {depositCopied ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy address
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Transfer action — hidden once transfer is mined */}
          {!transferDone && (
            <div className="flex gap-2">
              {/* Cancel -- only available before tx is submitted */}
              {!transferHash && (
                <Button
                  variant="outline"
                  onClick={handleCancelTransfer}
                  disabled={isTransferPending}
                  className="h-12 font-mono text-sm flex-shrink-0"
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSendTransfer}
                disabled={isTransferPending || isWaitingForTx || transferDone}
                className={cn(
                  "h-12 font-mono text-sm flex-1",
                  isDeposit
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-chart-5 text-white hover:bg-chart-5/90"
                )}
              >
                {isTransferPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm in Wallet...
                  </span>
                ) : isWaitingForTx ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Waiting for Confirmation...
                  </span>
                ) : (
                  `Send ${amount} ${token?.symbol}`
                )}
              </Button>
            </div>
          )}

          {/* Already transferred? Paste tx hash — visible before wallet tx is submitted */}
          {!transferHash && !transferDone && (
            <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/50 bg-muted/10">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Already transferred? Paste tx hash
              </span>
              <div className="flex gap-2">
                <Input
                  value={manualTxHash}
                  onChange={(e) => setManualTxHash(e.target.value)}
                  placeholder="0x..."
                  className={cn(
                    "h-9 font-mono text-[11px] flex-1",
                    manualTxHash && !/^0x[a-fA-F0-9]{64}$/.test(manualTxHash) && "border-destructive/50"
                  )}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!manualTxHash.trim() || isSubmittingManual}
                  onClick={handleManualTxHash}
                  className="h-9 font-mono text-xs gap-1.5 shrink-0"
                >
                  {isSubmittingManual ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {isSubmittingManual ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>
          )}

          {/* Tx hash badges */}
          {transferHash && (
            <TxBadge
              label="Source Tx"
              hash={transferHash}
              explorerUrl={sourceChain?.explorerTxUrl(transferHash)}
            />
          )}

          {/* Self-bridge VaultFunded: show "Complete Bridge" after transfer is mined */}
          {(isSelfVaultPending || (isSelfBridge && !isPermit2 && transferDone && !selfBridgeHash)) && (
            <div className="flex flex-col gap-2">
              <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <span className="text-xs font-mono text-foreground">
                  Tokens transferred. Now submit the bridge transaction.
                </span>
                {lzFeeFormatted && (
                  <span className="block text-[10px] font-mono text-muted-foreground mt-1">
                    LZ Gas: {Number(lzFeeFormatted).toFixed(6)} ETH (paid from your wallet)
                  </span>
                )}
                {!lzNativeFee && !isLzQuoteLoading && (
                  <span className="block text-[10px] font-mono text-destructive-foreground mt-1">
                    LZ quote failed{isLzQuoteError ? " (on-chain call reverted)" : ""}.
                    {isFeeExceedsAmount ? " Amount is below minimum fee." : ""}
                    {isComposeLoading ? " Compose msg loading..." : authorativeComposeMsg === "0x" && dappId > 0 ? " Compose msg empty." : ""}
                  </span>
                )}
                {isLzQuoteLoading && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground mt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Fetching LZ gas quote...
                  </span>
                )}
              </div>
              <Button
                onClick={() => handleSelfBridge()}
                disabled={isSelfBridgePending || isWaitingSelfBridge || !lzNativeFee}
                className={cn(
                  "h-12 font-mono text-sm",
                  isDeposit
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-chart-5 text-white hover:bg-chart-5/90"
                )}
              >
                {isSelfBridgePending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm Bridge Tx...
                  </span>
                ) : isWaitingSelfBridge ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Bridge Tx Confirming...
                  </span>
                ) : !lzNativeFee ? (
                  isLzQuoteLoading ? "Loading Quote..." : "Quote Unavailable"
                ) : (
                  `Complete Bridge (${isDeposit ? "Deposit" : "Withdraw"})`
                )}
              </Button>

              {/* Recovery option when quote fails — rescue tokens from vault */}
              {!lzNativeFee && !isLzQuoteLoading && activeSession && (
                <RecoveryPanel session={activeSession} />
              )}
            </div>
          )}

          {/* Operator mode: vault funded, awaiting backend processing */}
          {isOperatorVaultPending && (
            <div className="flex flex-col gap-2">
              <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs font-mono text-foreground">
                    Awaiting backend processing...
                  </span>
                </div>
                <span className="block text-[10px] font-mono text-muted-foreground mt-1">
                  The operator will pick up your deposit and submit the bridge transaction.
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for backend to detect transfer...
              </div>
              {/* Recovery option for stuck operator sessions */}
              {activeSession && (Date.now() - activeSession.createdAt > 120_000) && (
                <RecoveryPanel session={activeSession} />
              )}
            </div>
          )}

          {/* Self-bridge tx hash */}
          {selfBridgeHash && (
            <TxBadge
              label="Bridge Tx"
              hash={selfBridgeHash}
              explorerUrl={sourceChain?.explorerTxUrl(selfBridgeHash)}
            />
          )}

          {error && renderErrorBanner(error)}
        </div>
      )}

      {/* --- SESSION TRACKING VIEW --- */}
      {(step === "polling" || step === "complete") && activeSession && (
        <div className="flex flex-col gap-4">
          {/* Session ID — Mode/Dapp are LZ-flow concepts; native sessions
              show the bridge kind instead so the header reads coherently. */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/50">
            <span>Session: {activeSession.id}</span>
            <span>|</span>
            {activeSession.bridgeKind === "native" ? (
              <span>Kind: OP Stack Native</span>
            ) : (
              <>
                <span>Mode: {activeSession.bridgeMode}/{activeSession.transferMode}</span>
                <span>|</span>
                <span>Dapp: {activeSession.dappId ?? 0}</span>
              </>
            )}
          </div>
          <TrackingCard session={activeSession} />

          {/* New bridge button below tracking */}
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setActiveSession(null);
              resetForm();
            }}
            className="h-9 font-mono text-[11px] gap-1.5 text-muted-foreground hover:text-foreground self-center"
          >
            New Bridge
          </Button>
        </div>
      )}
    </div>
  );
}
