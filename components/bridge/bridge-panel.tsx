"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import {
  parseUnits,
  formatUnits,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
} from "viem";
import { useBridgeStore } from "@/lib/bridge-store";
import { riseGlobalDepositAbi, erc20Abi, oftConversionRateAbi } from "@/lib/abi";
import { CHAINS } from "@/config/chains";
import {
  TOKENS,
  SUPPORTED_TOKEN_KEYS,
  CONTRACTS,
  getTokenAddress,
  getGlobalDepositAddress,
} from "@/config/contracts";
import { BRIDGE_ROUTES } from "@/config/chains";
import {
  submitBridgeProcess,
  pollBridgeStatus,
  retryBridgeJob,
  isTerminalStatus,
} from "@/lib/bridge-service";
import { CONTRACT_ERROR_MAP, mapBackendStatus, type BridgeStatus, type BridgeSession } from "@/lib/types";

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
import {
  ArrowDown,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Shield,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function BridgePanel() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const {
    sourceChainId,
    destChainId,
    tokenKey,
    amount,
    depositAddress,
    activeSession,
    setSourceChainId,
    setDestChainId,
    setTokenKey,
    setAmount,
    setDepositAddress,
    createSession,
    updateSession,
    setActiveSession,
    resetForm,
    loadRecentSessions,
  } = useBridgeStore();

  const [step, setStep] = useState<
    "form" | "transfer" | "polling" | "complete"
  >("form");
  const [error, setError] = useState<string | null>(null);
  const [depositCopied, setDepositCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load recent sessions on mount
  useEffect(() => {
    loadRecentSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore step + error whenever the active session changes (including on mount / click)
  const sessionSelectedAt = useBridgeStore((s) => s.sessionSelectedAt);
  useEffect(() => {
    if (!activeSession) return;

    const s = activeSession.status;

    // Session has a jobId -- it interacted with the backend. Always show tracking.
    if (activeSession.jobId) {
      if (activeSession.error) {
        setError(activeSession.error);
      }
      // If it's still in-progress, resume polling
      if (!isTerminalStatus(s) && s !== "idle" && s !== "error" && s !== "failed") {
        setStep("polling");
        startPolling(activeSession.jobId, activeSession.id);
      } else {
        // failed / error / idle-with-jobId / completed -- show tracking (no polling)
        setStep("polling");
      }
      return;
    }

    // No jobId -- pure client-side states
    // Failed / error without jobId: show form with error
    if (s === "error" || s === "failed") {
      setError(activeSession.error ?? "Bridge transaction failed.");
      setStep("form");
      return;
    }

    // Transfer in progress (no jobId yet)
    if (
      s === "awaiting_transfer" ||
      s === "transfer_submitted" ||
      s === "transfer_mined" ||
      s === "deposit_verified"
    ) {
      setStep("transfer");
      return;
    }

    // Default: form
    setError(null);
    setStep("form");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, activeSession?.status, sessionSelectedAt]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const globalDepositAddr = getGlobalDepositAddress(sourceChainId);
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);
  const token = TOKENS[tokenKey];

  // --- Read user wallet token balance ---
  const { data: walletBalance, isLoading: isBalanceLoading } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!address && !!tokenAddress, retry: 3, retryDelay: 2000 },
  });

  // walletBalance can be 0n which is falsy, so check explicitly for undefined/null
  const formattedWalletBalance =
    walletBalance !== undefined && walletBalance !== null && token
      ? formatUnits(walletBalance, token.decimals)
      : null;

  // --- Compute deposit address from contract ---
  const {
    data: computedDepositAddr,
    isLoading: isComputingDeposit,
    isError: isComputeError,
    refetch: retryComputeDeposit,
  } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "computeDepositAddress",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!address && !!globalDepositAddr, retry: 3, retryDelay: 2000 },
  });

  useEffect(() => {
    if (computedDepositAddr) {
      setDepositAddress(computedDepositAddr as string);
    }
  }, [computedDepositAddr, setDepositAddress]);

  // --- Read fee config from GlobalDeposit contract ---
  const { data: feeConfig } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getFeeConfig",
    chainId: sourceChainId,
    query: { enabled: !!globalDepositAddr, retry: 3, retryDelay: 2000 },
  });

  // feeConfig returns [feeBps: uint16, feeCollector: address]
  const feeBps = feeConfig ? BigInt((feeConfig as [number, string])[0]) : 50n; // default 0.5%

  // --- Read tokenConfig to get OFT address, then query decimalConversionRate ---
  const { data: tokenConfig } = useReadContract({
    address: globalDepositAddr,
    abi: riseGlobalDepositAbi,
    functionName: "getTokenConfig",
    args: tokenAddress ? [tokenAddress] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!globalDepositAddr && !!tokenAddress, retry: 3, retryDelay: 2000 },
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
    query: { enabled: !!oftAddress, retry: 3, retryDelay: 2000 },
  });

  // decimalConversionRate: for 6-decimal USDC with 6 shared decimals, rate = 1 (no dust)
  // for tokens with localDecimals > sharedDecimals, rate = 10^(localDecimals - sharedDecimals)
  const dustRate = rawConversionRate ? BigInt(rawConversionRate as bigint) : 1n;

  // --- Check deposit address balance ---
  const { data: depositBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: depositAddress ? [depositAddress as Address] : undefined,
    chainId: sourceChainId,
    query: { enabled: !!depositAddress && !!tokenAddress && step === "transfer", retry: 3, retryDelay: 2000 },
  });

  // --- Token transfer ---
  const {
    writeContract: writeTransfer,
    data: transferHash,
    isPending: isTransferPending,
    error: transferError,
  } = useWriteContract();

  const { isLoading: isWaitingForTx, isSuccess: isTxMined } =
    useWaitForTransactionReceipt({
      hash: transferHash,
      chainId: sourceChainId,
    });

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
      depositAddress,
    });
    updateSession(session.id, {
      userTransferTxHash: transferHash,
      status: "transfer_submitted",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferHash]);

  // When tx mined, verify deposit and call backend
  useEffect(() => {
    if (isTxMined && activeSession) {
      updateSession(activeSession.id, { status: "transfer_mined" });
      handlePostMine();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxMined]);

  const handlePostMine = useCallback(async () => {
    if (!activeSession) return;

    // Verify deposit balance on source chain
    const balResult = await refetchBalance();
    const bal = balResult.data;
    if (bal && bal > 0n) {
      updateSession(activeSession.id, { status: "deposit_verified" });
    }

    // Build compose message: abi.encode(address receiver, address target, bytes data)
    const destContracts = CONTRACTS[activeSession.destChainId];
    const composerAddr = destContracts?.riseXComposer;
    const collateralMgr = destContracts?.collateralManager;
    const destUsdcAddr = getTokenAddress(activeSession.tokenKey, activeSession.destChainId);
    const decimals = TOKENS[activeSession.tokenKey].decimals;
    const grossAmount = parseUnits(activeSession.amount, decimals);

    // Compute net amount after protocol fee deduction
    // fee = grossAmount * feeBps / 10000 (feeBps from on-chain getFeeConfig, default 50 = 0.5%)
    const protocolFee = (grossAmount * feeBps) / 10000n;
    const afterFee = grossAmount - protocolFee;

    // Remove OFT dust: mirrors on-chain _removeDust: (amount / rate) * rate
    // dustRate = decimalConversionRate from the OFT contract (default 1 = no dust for 6-dec USDC)
    const bridgeAmount = (afterFee / dustRate) * dustRate;

    // Encode the deposit(address account, address token, uint256 amount) calldata
    // IMPORTANT: use bridgeAmount (post-fee, post-dust) since only that amount arrives on destination
    const depositCalldata = encodeFunctionData({
      abi: [{
        name: "deposit",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "account", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [],
      }],
      functionName: "deposit",
      args: [
        activeSession.userAddress as Address,   // account = user
        destUsdcAddr as Address,                // token = USDC on RISE
        bridgeAmount,                           // post-fee, post-dust amount
      ],
    });

    // Encode the full compose message: (address receiver, address target, bytes data)
    const composeMsg = encodeAbiParameters(
      parseAbiParameters("address receiver, address target, bytes data"),
      [
        activeSession.userAddress as Address,   // receiver = must match request receiver
        collateralMgr as Address,               // target = collateral manager
        depositCalldata,                        // data = deposit calldata
      ],
    );

    // Submit to real bridge API
    try {
      const res = await submitBridgeProcess({
        sourceChainId: activeSession.sourceChainId,
        userTransferTxHash: activeSession.userTransferTxHash!,
        token: getTokenAddress(activeSession.tokenKey, activeSession.sourceChainId)!,
        receiver: activeSession.userAddress,
        composer: composerAddr ?? "0x9bf8053c29c533b6238fc4e72a97eca8016501dd",
        composeMsg,
      });

      updateSession(activeSession.id, {
        status: mapBackendStatus(res.status),
        jobId: res.jobId,
        backendProcessTxHash: res.backendProcessTxHash ?? undefined,
        composer: composerAddr ?? "0x9bf8053c29c533b6238fc4e72a97eca8016501dd",
        composeMsg,
      });

      setStep("polling");
      startPolling(res.jobId, activeSession.id);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Backend processing failed";
      updateSession(activeSession.id, { status: "error", error: errMsg });
      setError(errMsg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, feeBps, dustRate]);

  const startPolling = useCallback(
    (jobId: string, sessionId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const res = await pollBridgeStatus(jobId);
          const mappedStatus = mapBackendStatus(res.status);

          // Normalize compose status from backend to match LZ Scan conventions
          // Backend may return: "executed", "failed", "reverted", null, etc.
          const rawCompose = res.composeStatus?.toLowerCase() ?? "";
          const normalizedComposeStatus = rawCompose.includes("fail") || rawCompose.includes("revert")
            ? "FAILED"
            : rawCompose === "executed" || rawCompose.includes("succeed") || rawCompose.includes("success")
              ? "SUCCEEDED"
              : rawCompose === "not_executed"
                ? "NOT_EXECUTED"
                : res.composeStatus ?? undefined;

          const sessionUpdates: Partial<BridgeSession> = {
            status: mappedStatus,
            backendProcessTxHash: res.backendProcessTxHash ?? undefined,
            lzMessageId: res.lzMessageId ?? undefined,
            destinationTxHash: res.destinationTxHash ?? undefined,
            error: res.error ?? undefined,
            lzTracking: {
              guid: res.lzMessageId ?? undefined,
              lzStatus: res.status,
              srcTxHash: res.userTransferTxHash,
              dstTxHash: res.destinationTxHash ?? undefined,
              composeStatus: normalizedComposeStatus,
              composeTxHash: res.composeTxHash ?? undefined,
              sender: res.sender ?? undefined,
              receiver: res.receiver,
            },
          };

          updateSession(sessionId, sessionUpdates);

          if (isTerminalStatus(res.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;

            // Compose can fail even when the backend reports "completed"
            const composeFailed = normalizedComposeStatus === "FAILED";

            if (composeFailed) {
              setError("lzCompose failed on destination chain. You can retry the compose execution.");
            } else if (res.status === "completed") {
              setStep("complete");
            } else if (res.status === "failed") {
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

  // --- Handlers ---
  const handleInitiateBridge = () => {
    if (!address || !depositAddress) return;
    setError(null);

    // Do NOT create session yet -- only move to transfer step.
    // Session is created once the user actually submits the on-chain tx.

    // Check if user is on the right chain
    if (walletChainId !== sourceChainId) {
      switchChain({ chainId: sourceChainId });
    }

    setStep("transfer");
  };

  const handleCancelTransfer = () => {
    setError(null);
    setStep("form");
    // Don't reset form fields so the user keeps their amount/token selection
  };

  const handleSendTransfer = () => {
    if (!tokenAddress || !depositAddress || !amount || !token) return;
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

  const handleRetry = async () => {
    setError(null);

    // If the active session has a jobId and is in failed/error status, try the real retry API
    if (activeSession?.jobId && (activeSession.status === "failed" || activeSession.status === "error")) {
      try {
        const res = await retryBridgeJob(activeSession.jobId);
        updateSession(activeSession.id, {
          status: mapBackendStatus(res.status),
          error: undefined,
        });
        setStep("polling");
        startPolling(activeSession.jobId, activeSession.id);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Retry failed";
        setError(errMsg);
        // Fall through to reset if retry fails
      }
    }

    // If no jobId or retry failed, reset to form
    if (activeSession) {
      updateSession(activeSession.id, { status: "idle" });
    }
    setStep("form");
    resetForm();
  };

  const handleCopyDeposit = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      setDepositCopied(true);
      setTimeout(() => setDepositCopied(false), 2000);
    }
  };

  const currentStatus: BridgeStatus = activeSession?.status ?? "idle";
  const sourceChain = CHAINS[sourceChainId];
  const destChain = CHAINS[destChainId];

  // Data-driven flag: show tracking view whenever the session has a jobId
  // (meaning the backend was involved). This works regardless of status --
  // even if status was reset to "idle" by a retry or "Start Over".
  const showTrackingView = !!(
    activeSession &&
    (activeSession.jobId || (activeSession.userTransferTxHash && activeSession.status !== "idle"))
  );

  // Dust amount warning
  const parsedAmount =
    amount && token ? parseUnits(amount || "0", token.decimals) : 0n;
  const isDustWarning = parsedAmount > 0n && parsedAmount < 1000n;

  // --- Render ---
  return (
    <div className="flex flex-col gap-4">
      {/* Status rail - visible when session has progressed past idle, or has a jobId/error */}
      {activeSession &&
        (activeSession.status !== "idle" || activeSession.jobId || activeSession.error) &&
        activeSession.status !== "awaiting_transfer" && (
        <div className="p-3 rounded-lg border border-border bg-card">
          <StatusRail
            currentStatus={(() => {
              const cs = activeSession.lzTracking?.composeStatus?.toLowerCase() ?? "";
              const composeFailed = cs.includes("fail") || cs.includes("revert") ||
                activeSession.error?.toLowerCase().includes("compose");
              if (composeFailed) return "failed" as const;
              if (activeSession.error && currentStatus === "idle") return "error" as const;
              return currentStatus;
            })()}
            error={(() => {
              const cs = activeSession.lzTracking?.composeStatus?.toLowerCase() ?? "";
              const composeFailed = cs.includes("fail") || cs.includes("revert") ||
                activeSession.error?.toLowerCase().includes("compose");
              if (composeFailed) return "lzCompose failed on destination chain";
              return activeSession.error ?? error ?? undefined;
            })()}
          />
        </div>
      )}

      {/* --- FORM STEP --- */}
      {step === "form" && !showTrackingView && (
        <div className="flex flex-col gap-4">
          {/* Source chain */}
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              From
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Select
                value={String(sourceChainId)}
                onValueChange={(v) => setSourceChainId(Number(v))}
              >
                <SelectTrigger className="w-full sm:w-52 bg-muted/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIDGE_ROUTES.map((r) => {
                    const meta = CHAINS[r.sourceChainId];
                    return (
                      <SelectItem
                        key={r.sourceChainId}
                        value={String(r.sourceChainId)}
                        className="font-mono text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <ChainIcon chainKey={meta?.iconKey} className="h-4 w-4" />
                          {meta?.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select
                value={tokenKey}
                onValueChange={setTokenKey}
              >
                <SelectTrigger className="w-full sm:w-36 bg-muted/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_TOKEN_KEYS.map((k) => (
                    <SelectItem
                      key={k}
                      value={k}
                      className="font-mono text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <TokenIcon tokenKey={k} className="h-4 w-4" />
                        {TOKENS[k].symbol}
                      </span>
                    </SelectItem>
                  ))}
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
                  {isBalanceLoading ? (
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

          {/* Arrow */}
          <div className="flex justify-center -my-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Destination chain */}
          <div className="p-3 sm:p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              To
            </label>
            <Select
              value={String(destChainId)}
              onValueChange={(v) => setDestChainId(Number(v))}
            >
              <SelectTrigger className="w-full sm:w-52 bg-muted/50 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRIDGE_ROUTES.map((r) => {
                  const meta = CHAINS[r.destChainId];
                  return (
                    <SelectItem
                      key={r.destChainId}
                      value={String(r.destChainId)}
                      className="font-mono text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <ChainIcon chainKey={meta?.iconKey} className="h-4 w-4" />
                        {meta?.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Deposit address preview */}
          {isConnected && (
            <div className="p-2.5 sm:p-3 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Deposit Address
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
                    Computing deposit address...
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

          {/* Error banner + retry for failed backend processing */}
          {activeSession && (activeSession.status === "error" || activeSession.status === "failed") && (error || activeSession.error) && (
            <div className="flex flex-col gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-2 text-xs font-mono text-destructive-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error || activeSession.error || "Bridge transaction failed."}</span>
              </div>
              <div className="flex gap-2">
                {activeSession.jobId ? (
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    className="h-10 font-mono text-sm gap-2 flex-1 border-destructive/30 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry Bridge Job
                  </Button>
                ) : activeSession.userTransferTxHash ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      handlePostMine();
                    }}
                    className="h-10 font-mono text-sm gap-2 flex-1 border-destructive/30 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry Processing
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    if (activeSession) {
                      updateSession(activeSession.id, { status: "idle", error: undefined });
                    }
                    setStep("form");
                    resetForm();
                  }}
                  className="h-10 font-mono text-sm gap-2 text-muted-foreground"
                >
                  Start Over
                </Button>
              </div>
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={handleInitiateBridge}
            disabled={
              !isConnected ||
              !amount ||
              parseFloat(amount) <= 0 ||
              !depositAddress ||
              isComputingDeposit
            }
            className="h-12 font-mono text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {!isConnected ? (
              "Connect Wallet First"
            ) : isComputingDeposit ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Computing Deposit Address...
              </span>
            ) : isComputeError ? (
              "Deposit Address Error -- Retry Above"
            ) : !depositAddress ? (
              "Waiting for Deposit Address..."
            ) : !amount || parseFloat(amount) <= 0 ? (
              "Enter Amount"
            ) : (
              `Bridge ${amount} ${token?.symbol}`
            )}
          </Button>
        </div>
      )}

      {/* --- TRANSFER STEP --- */}
      {step === "transfer" && !showTrackingView && (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-mono text-foreground">
                  Send {amount} {token?.symbol} to deposit address
                </span>
                <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                  {depositAddress}
                </p>
                <button
                  onClick={handleCopyDeposit}
                  className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors mt-1 self-start"
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

          {/* Transfer action */}
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
              disabled={isTransferPending || isWaitingForTx}
              className="h-12 font-mono text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex-1"
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

          {/* Tx hash badges */}
          {transferHash && (
            <TxBadge
              label="Source Tx"
              hash={transferHash}
              explorerUrl={sourceChain?.explorerTxUrl(transferHash)}
            />
          )}

          {error && (
            <div className="flex flex-col gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-2 text-xs font-mono text-destructive-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <div className="flex gap-2">
                {/* Retry: if we have a jobId, call retry API; otherwise re-submit handlePostMine */}
                {activeSession?.jobId ? (
                  <Button
                    variant="outline"
                    onClick={handleRetry}
                    className="h-10 font-mono text-sm gap-2 flex-1 border-destructive/30 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry Bridge Job
                  </Button>
                ) : activeSession?.userTransferTxHash ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      handlePostMine();
                    }}
                    className="h-10 font-mono text-sm gap-2 flex-1 border-destructive/30 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry Processing
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    if (activeSession) {
                      updateSession(activeSession.id, { status: "idle", error: undefined });
                    }
                    setStep("form");
                    resetForm();
                  }}
                  className="h-10 font-mono text-sm gap-2 text-muted-foreground"
                >
                  Start Over
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- SESSION TRACKING VIEW --- */}
      {/* Purely data-driven: no dependency on local `step` state.
          TrackingCard handles its own error display + retry button internally. */}
      {showTrackingView && activeSession && (
        <div className="flex flex-col gap-4">
          <TrackingCard session={activeSession} feeBps={feeBps} dustRate={dustRate} />

          {/* New bridge button below tracking */}
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setActiveSession(null);
              setStep("form");
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
