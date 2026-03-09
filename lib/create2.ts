/**
 * Pure CREATE2 vault address computation — mirrors the on-chain Solidity logic
 * in VaultFactory._laneSalt + OpenZeppelin Clones.predictDeterministicAddress.
 *
 * No React, no hooks — just deterministic math.
 */

import {
  type Address,
  type Hex,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getCreate2Address,
} from "viem";
import { CHAINS } from "@/config/chains";
import { CONTRACTS, getBridgeDirection } from "@/config/contracts";

/**
 * Mirrors Solidity: EfficientHashLib.hash(bytes32(srcEid), bytes32(dstEid), bytes32(dappId), bytes32(srcAddress), bytes32(dstAddress))
 *
 * EfficientHashLib.hash for 5 bytes32 args = keccak256 of 160 bytes (5 × 32).
 * abi.encode(uint256, uint256, uint256, uint256, uint256) produces the same layout.
 */
export function computeVaultSalt(
  srcEid: number,
  dstEid: number,
  dappId: number,
  srcAddress: Address,
  dstAddress: Address,
): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("uint256,uint256,uint256,uint256,uint256"),
      [
        BigInt(srcEid),
        BigInt(dstEid),
        BigInt(dappId),
        BigInt(srcAddress),
        BigInt(dstAddress),
      ],
    ),
  );
}

/**
 * Constructs the 55-byte EIP-1167 minimal proxy creation code and returns its keccak256.
 *
 * Layout (55 bytes total):
 *   0x3d602d80600a3d3981f3  (10 bytes — creation code prefix)
 *   363d3d373d3d3d363d73    (10 bytes — runtime code start)
 *   {20-byte impl address}  (20 bytes)
 *   5af43d82803e903d91602b57fd5bf3  (15 bytes — runtime code end)
 */
export function eip1167InitcodeHash(implementation: Address): Hex {
  // Strip 0x prefix, lowercase
  const impl = implementation.slice(2).toLowerCase();
  const bytecode: Hex = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl}5af43d82803e903d91602b57fd5bf3`;
  return keccak256(bytecode);
}

/**
 * Predicts a clone address using CREATE2.
 * Mirrors OpenZeppelin Clones.predictDeterministicAddress(implementation, salt, deployer).
 */
export function predictCloneAddress(
  deployer: Address,
  implementation: Address,
  salt: Hex,
): Address {
  return getCreate2Address({
    from: deployer,
    salt,
    bytecodeHash: eip1167InitcodeHash(implementation),
  });
}

/**
 * High-level: compute a deposit vault address locally.
 *
 * For deposits (Sepolia → RISE):
 *   deployer = GlobalDeposit, srcEid = Sepolia LZ EID, dstEid = RISE LZ EID
 *
 * For withdrawals (RISE → Sepolia):
 *   deployer = GlobalWithdraw, srcEid = RISE LZ EID, dstEid = Sepolia LZ EID, dappId = 0
 */
export function computeDepositVaultAddress(params: {
  sourceChainId: number;
  destChainId: number;
  dappId: number;
  srcAddress: Address;
  dstAddress: Address;
  vaultImpl: Address;
}): Address {
  const { sourceChainId, destChainId, dappId, srcAddress, dstAddress, vaultImpl } = params;

  const srcEid = CHAINS[sourceChainId]?.lzEid;
  const dstEid = CHAINS[destChainId]?.lzEid;

  if (!srcEid || !dstEid) {
    throw new Error(`Unknown chain: src=${sourceChainId} dst=${destChainId}`);
  }

  const isDeposit = getBridgeDirection(sourceChainId) === "deposit";
  const deployer = isDeposit
    ? CONTRACTS[sourceChainId]?.globalDeposit
    : CONTRACTS[sourceChainId]?.globalWithdraw;

  if (!deployer) {
    throw new Error(`No deployer contract for chain ${sourceChainId}`);
  }

  const salt = computeVaultSalt(srcEid, dstEid, dappId, srcAddress, dstAddress);
  return predictCloneAddress(deployer, vaultImpl, salt);
}
