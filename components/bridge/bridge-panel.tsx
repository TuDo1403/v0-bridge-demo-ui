"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import { useBridgeStore } from "@/lib/bridge-store";
import { riseGlobalDepositAbi, erc20Abi } from "@/lib/abi";
import { CHAINS } from "@/config/chains";
import {
  TOKENS,
  SUPPORTED_TOKEN_KEYS,
  getTokenAddress,
  getGlobalDepositAddress,
} from "@/config/contracts";
import { BRIDGE_ROUTES } from "@/config/chains";
import {
  submitBridgeProcess,
  pollBridgeStatus,
  isTerminalStatus,
} from "@/lib/bridge-service";
import { CONTRACT_ERROR_MAP, type BridgeStatus, type BridgeSession } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  // Resume polling if active session is in a polling state
  useEffect(() => {
    if (
      activeSession &&
      activeSession.jobId &&
      !isTerminalStatus(activeSession.status) &&
      ["backend_submitted", "lz_pending", "destination_confirmed"].includes(
        activeSession.status
      )
    ) {
      setStep("polling");
      startPolling(activeSession.jobId, activeSession.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

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

  // Update session when transfer hash received
  useEffect(() => {
    if (transferHash && activeSession) {
      updateSession(activeSession.id, {
        userTransferTxHash: transferHash,
        status: "transfer_submitted",
      });
    }
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

    // Verify deposit
    const balResult = await refetchBalance();
    const bal = balResult.data;
    if (bal && bal > 0n) {
      updateSession(activeSession.id, { status: "deposit_verified" });
    }

    // Submit to backend
    try {
      const res = await submitBridgeProcess({
        sourceChainId: activeSession.sourceChainId,
        dstChainId: activeSession.destChainId,
        token: tokenKey,
        amount: activeSession.amount,
        userAddress: activeSession.userAddress,
        depositAddress: activeSession.depositAddress,
        userTransferTxHash: activeSession.userTransferTxHash!,
      });

      updateSession(activeSession.id, {
        status: "backend_submitted",
        jobId: res.jobId,
        backendProcessTxHash: res.backendProcessTxHash,
        lzMessageId: res.lzMessageId,
        lzTxHash: res.lzTxHash,
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
  }, [activeSession, tokenKey]);

  const startPolling = useCallback(
    (jobId: string, sessionId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const status = await pollBridgeStatus(jobId);

          const sessionUpdates: Partial<BridgeSession> = {
            status: status.status as BridgeStatus,
            backendProcessTxHash: status.backendProcessTxHash,
            lzMessageId: status.lzMessageId,
            lzTxHash: status.lzTxHash,
            destinationTxHash: status.destinationTxHash,
            error: status.error,
          };

          // Merge LZ tracking snapshot from backend
          if (status.lzTracking) {
            sessionUpdates.lzTracking = status.lzTracking;
          }

          updateSession(sessionId, sessionUpdates);

          if (isTerminalStatus(status.status)) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            if (status.status === "completed") {
              setStep("complete");
            } else if (status.error) {
              setError(status.error);
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

    const session = createSession({
      userAddress: address,
      depositAddress,
    });

    // Check if user is on the right chain
    if (walletChainId !== sourceChainId) {
      switchChain({ chainId: sourceChainId });
    }

    setStep("transfer");
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

  const handleRetry = () => {
    setError(null);
    if (activeSession && activeSession.status === "error") {
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

  // Dust amount warning
  const parsedAmount =
    amount && token ? parseUnits(amount || "0", token.decimals) : 0n;
  const isDustWarning = parsedAmount > 0n && parsedAmount < 1000n;

  // --- Render ---
  return (
    <div className="flex flex-col gap-4">
      {/* Status rail - always visible when session active */}
      {activeSession && (
        <div className="p-3 rounded-lg border border-border bg-card">
          <StatusRail
            currentStatus={currentStatus}
            error={activeSession.error ?? error ?? undefined}
          />
        </div>
      )}

      {/* --- FORM STEP --- */}
      {step === "form" && (
        <div className="flex flex-col gap-4">
          {/* Source chain */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              From
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Select
                value={String(sourceChainId)}
                onValueChange={(v) => setSourceChainId(Number(v))}
              >
                <SelectTrigger className="w-full sm:w-48 bg-muted/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIDGE_ROUTES.map((r) => (
                    <SelectItem
                      key={r.sourceChainId}
                      value={String(r.sourceChainId)}
                      className="font-mono text-sm"
                    >
                      {CHAINS[r.sourceChainId]?.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={tokenKey}
                onValueChange={setTokenKey}
              >
                <SelectTrigger className="w-full sm:w-32 bg-muted/50 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_TOKEN_KEYS.map((k) => (
                    <SelectItem
                      key={k}
                      value={k}
                      className="font-mono text-sm"
                    >
                      {TOKENS[k].symbol}
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
          <div className="p-4 rounded-lg border border-border bg-card">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
              To
            </label>
            <Select
              value={String(destChainId)}
              onValueChange={(v) => setDestChainId(Number(v))}
            >
              <SelectTrigger className="w-full sm:w-48 bg-muted/50 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRIDGE_ROUTES.map((r) => (
                  <SelectItem
                    key={r.destChainId}
                    value={String(r.destChainId)}
                    className="font-mono text-sm"
                  >
                    {CHAINS[r.destChainId]?.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Deposit address preview */}
          {isConnected && (
            <div className="p-3 rounded-lg border border-border bg-muted/20">
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
      {step === "transfer" && activeSession && (
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
              </div>
            </div>
          </div>

          {/* Transfer action */}
          <Button
            onClick={handleSendTransfer}
            disabled={isTransferPending || isWaitingForTx}
            className="h-12 font-mono text-sm bg-primary text-primary-foreground hover:bg-primary/90"
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
              "Send Transfer"
            )}
          </Button>

          {/* Tx hash badges */}
          {transferHash && (
            <TxBadge
              label="Source Tx"
              hash={transferHash}
              explorerUrl={sourceChain?.explorerTxUrl(transferHash)}
            />
          )}

          {error && (
            <div className="flex flex-col gap-2">
              <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded text-xs font-mono text-destructive-foreground">
                {error}
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="font-mono text-sm gap-2"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* --- POLLING STEP (with interactive tracking card) --- */}
      {step === "polling" && activeSession && (
        <div className="flex flex-col gap-4">
          <TrackingCard session={activeSession} />

          {error && (
            <Button
              variant="outline"
              onClick={handleRetry}
              className="font-mono text-sm gap-2"
            >
              <RotateCcw className="h-3 w-3" />
              Start New Bridge
            </Button>
          )}
        </div>
      )}

      {/* --- COMPLETE STEP --- */}
      {step === "complete" && activeSession && (
        <div className="flex flex-col gap-4">
          <TrackingCard session={activeSession} />

          <Button
            onClick={handleRetry}
            className="h-10 font-mono text-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            New Bridge
          </Button>
        </div>
      )}
    </div>
  );
}
