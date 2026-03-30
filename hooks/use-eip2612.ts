"use client";

import { useCallback, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  usePublicClient,
} from "wagmi";
import { type Address, zeroAddress } from "viem";
import { getTokenAddress } from "@/config/contracts";

/* ------------------------------------------------------------------ */
/*  EIP-2612 Permit ABI fragments                                      */
/* ------------------------------------------------------------------ */

const eip2612Abi = [
  {
    name: "nonces",
    type: "function",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "name",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    name: "DOMAIN_SEPARATOR",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  EIP-2612 EIP-712 type definitions                                  */
/* ------------------------------------------------------------------ */

const EIP2612_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/* ------------------------------------------------------------------ */
/*  Hook interface                                                     */
/* ------------------------------------------------------------------ */

interface UseEIP2612Params {
  sourceChainId: number;
  tokenKey: string;
  enabled?: boolean;
}

interface EIP2612PermitData {
  permitType: 3; // PermitEIP2612
  target: Address;
  deadline: bigint;
  nonce: bigint;
  signature: `0x${string}`;
}

interface UseEIP2612Return {
  /** Whether the token supports EIP-2612 permit */
  supportsEIP2612: boolean;
  /** Still checking if token supports EIP-2612 */
  isDetecting: boolean;
  /** Sign an EIP-2612 permit for the given spender and amount */
  signPermit: (params: {
    amount: bigint;
    spender: Address;
  }) => Promise<EIP2612PermitData>;
  isSigning: boolean;
}

/**
 * Detects EIP-2612 support and provides permit signing.
 *
 * Detection: calls `nonces(0x0)` on the token — if it succeeds,
 * the token implements EIP-2612.
 *
 * No approval step needed — EIP-2612 permit IS the approval.
 */
export function useEIP2612({
  sourceChainId,
  tokenKey,
  enabled = true,
}: UseEIP2612Params): UseEIP2612Return {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: sourceChainId });
  const tokenAddress = getTokenAddress(tokenKey, sourceChainId);

  // Detect EIP-2612 support by calling nonces(0x0).
  // If the call succeeds (returns a uint256), the token supports it.
  const { data: probeNonce, isLoading: isDetecting } = useReadContract({
    address: tokenAddress,
    abi: eip2612Abi,
    functionName: "nonces",
    args: [zeroAddress],
    chainId: sourceChainId,
    query: {
      enabled: enabled && !!tokenAddress,
      retry: false,
      staleTime: Infinity, // won't change for a given token
    },
  });

  const supportsEIP2612 = probeNonce !== undefined;

  // Try ERC-5267 eip712Domain() first — returns the exact domain used for permit signing.
  // Falls back to reading name() + version() if not available.
  const { data: eip712DomainData } = useReadContract({
    address: tokenAddress,
    abi: [{
      name: "eip712Domain",
      type: "function",
      inputs: [],
      outputs: [
        { name: "fields", type: "bytes1" },
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
        { name: "salt", type: "bytes32" },
        { name: "extensions", type: "uint256[]" },
      ],
      stateMutability: "view",
    }] as const,
    functionName: "eip712Domain",
    chainId: sourceChainId,
    query: {
      enabled: enabled && supportsEIP2612 && !!tokenAddress,
      retry: false,
      staleTime: Infinity,
    },
  });

  // Fallback: read ERC-20 name() when eip712Domain() is not available
  const { data: erc20Name } = useReadContract({
    address: tokenAddress,
    abi: eip2612Abi,
    functionName: "name",
    chainId: sourceChainId,
    query: {
      enabled: enabled && supportsEIP2612 && !eip712DomainData && !!tokenAddress,
      staleTime: Infinity,
    },
  });

  // Resolve domain name: prefer ERC-5267, fall back to ERC-20 name()
  const domainName = eip712DomainData?.[1] ?? erc20Name;
  const domainVersion = eip712DomainData?.[2]; // undefined if no ERC-5267

  // Read current nonce for the connected wallet
  const { data: ownerNonce, refetch: refetchNonce } = useReadContract({
    address: tokenAddress,
    abi: eip2612Abi,
    functionName: "nonces",
    args: address ? [address] : undefined,
    chainId: sourceChainId,
    query: {
      enabled: enabled && supportsEIP2612 && !!address && !!tokenAddress,
      staleTime: 10_000,
    },
  });

  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData();

  const signPermit = useCallback(
    async (params: {
      amount: bigint;
      spender: Address;
    }): Promise<EIP2612PermitData> => {
      if (!address) throw new Error("Wallet not connected");
      if (!tokenAddress) throw new Error("Token address not found");
      if (!domainName) throw new Error("Could not read token domain name for EIP-712 signing");
      if (!publicClient) throw new Error("Public client not available");

      // Refetch nonce right before signing to avoid stale values
      const { data: freshNonce } = await refetchNonce();
      const nonce = freshNonce ?? ownerNonce;
      if (nonce === undefined) {
        throw new Error("Could not read owner nonce for EIP-2612 permit signing");
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

      // Resolve version: prefer ERC-5267 domain, then try version() call, then default
      let version = domainVersion;
      if (!version) {
        try {
          const v = await publicClient.readContract({
            address: tokenAddress,
            abi: [{ name: "version", type: "function", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" }] as const,
            functionName: "version",
          });
          if (v) version = v;
        } catch {
          // version() likely doesn't exist
        }
      }
      // Final fallback if still undefined or empty string
      if (!version) {
        version = "1";
      }

      const domain = {
        name: domainName,
        version,
        chainId: sourceChainId,
        verifyingContract: tokenAddress,
      };

      const signature = await signTypedDataAsync({
        domain,
        types: EIP2612_TYPES,
        primaryType: "Permit",
        message: {
          owner: address,
          spender: params.spender,
          value: params.amount,
          nonce,
          deadline,
        },
      });

      return {
        permitType: 3,
        target: zeroAddress,
        deadline,
        nonce,
        signature: signature as `0x${string}`,
      };
    },
    [address, tokenAddress, domainName, domainVersion, sourceChainId, publicClient, ownerNonce, refetchNonce, signTypedDataAsync]
  );

  return useMemo(
    () => ({
      supportsEIP2612,
      isDetecting,
      signPermit,
      isSigning,
    }),
    [supportsEIP2612, isDetecting, signPermit, isSigning]
  );
}
