"use client";

import { useState, useEffect, useCallback } from "react";
import { type Address } from "viem";
import { chainIdToEid } from "@/config/chains";
import { type BridgeDirection } from "@/config/contracts";
import { getDepositAddress } from "@/lib/bridge-service";

interface UseDepositAddressParams {
  sourceChainId: number;
  destChainId: number;
  dappId: number;
  address: Address | undefined;
  /** Recipient on destination chain. Falls back to `address` (self-bridge) when empty/undefined. */
  recipientAddress?: string;
  direction: BridgeDirection;
}

interface UseDepositAddressReturn {
  /** Deposit/withdrawal vault address from backend API */
  depositAddress: Address | undefined;
  /** Whether the API call is still loading */
  isLoading: boolean;
  /** True if the API call errored */
  isError: boolean;
  /** Refetch the address */
  refetch: () => void;
}

export function useDepositAddress({
  sourceChainId,
  destChainId,
  dappId,
  address,
  recipientAddress,
  direction,
}: UseDepositAddressParams): UseDepositAddressReturn {
  const [depositAddress, setDepositAddress] = useState<Address | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const isDeposit = direction === "deposit";

  // Resolved recipient: custom address or self-bridge
  const recipient = recipientAddress?.trim() || address;

  const srcEid = chainIdToEid(sourceChainId);
  const dstEid = chainIdToEid(destChainId);

  // For deposits: dappId as passed; for withdrawals: always 0
  const effectiveDappId = isDeposit ? dappId : 0;

  const fetchAddress = useCallback(async () => {
    if (!address || !recipient) return;

    setIsLoading(true);
    setIsError(false);
    try {
      const result = await getDepositAddress({
        srcEid,
        dstEid,
        srcAddr: address,
        dstAddr: recipient,
        dappId: effectiveDappId,
      });
      setDepositAddress(result.depositAddress as Address);
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [srcEid, dstEid, address, recipient, effectiveDappId]);

  useEffect(() => {
    if (!address || !recipient) {
      setDepositAddress(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setIsError(false);
      try {
        const result = await getDepositAddress({
          srcEid,
          dstEid,
          srcAddr: address,
          dstAddr: recipient,
          dappId: effectiveDappId,
        });
        if (!cancelled) {
          setDepositAddress(result.depositAddress as Address);
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [srcEid, dstEid, address, recipient, effectiveDappId]);

  return {
    depositAddress,
    isLoading,
    isError,
    refetch: fetchAddress,
  };
}
