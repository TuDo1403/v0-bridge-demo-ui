// Minimal ABIs for the OP Stack native bridge convenience entry points.
// Used by NativeBridgeAction via wagmi useWriteContract; full bindings live
// on the backend in pkg/rpc/contract/.
//
// The Standard Bridge convenience calls emit ETHBridgeInitiated alongside
// the underlying portal/messagePasser event the backend indexes — they're
// the right entry points for users sending ETH to a custom recipient.

import type { Abi } from "viem";

export const l1StandardBridgeAbi = [
  {
    type: "function",
    name: "bridgeETHTo",
    stateMutability: "payable",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "bridgeETH",
    stateMutability: "payable",
    inputs: [
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const l2StandardBridgeAbi = [
  {
    type: "function",
    name: "withdrawTo",
    stateMutability: "payable",
    inputs: [
      { name: "_l2Token", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "payable",
    inputs: [
      { name: "_l2Token", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minGasLimit", type: "uint32" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

/** OP Stack predeploy alias for native ETH on L2 — the L2StandardBridge
 *  expects this address as `_l2Token` for ETH withdrawals (it never has
 *  bytecode at this address; the bridge unwraps to native gas token). */
export const ETH_L2_TOKEN_ALIAS = "0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000" as const;

/** Default gas limit forwarded from the bridge contract to the recipient on
 *  the destination chain. 200_000 is OP's recommended default for plain ETH
 *  transfers; bumped to 300_000 for safety against future protocol changes. */
export const DEFAULT_NATIVE_BRIDGE_GAS_LIMIT = 300_000;
