import {
  type Address,
  parseUnits,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";

/* ------------------------------------------------------------------ */
/*  Token definitions                                                  */
/* ------------------------------------------------------------------ */

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  /** Token address per chainId */
  addresses: Record<number, Address>;
  icon?: string;
}

export const TOKENS: Record<string, TokenMeta> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    addresses: {
      11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      11155931: "0x6bf6e258b3c5650b448cb1112835048ba5619dc1",
    },
  },
  // Extensible: add WETH, WBTC here
  // WETH: { symbol: "WETH", name: "Wrapped Ether", decimals: 18, addresses: { ... } },
};

export const SUPPORTED_TOKEN_KEYS = Object.keys(TOKENS);

/* ------------------------------------------------------------------ */
/*  Contract addresses per chain                                       */
/* ------------------------------------------------------------------ */

export interface ChainContracts {
  globalDeposit?: Address;
  lockReleaseOFT?: Address;
  usdcMintBurnAdapter?: Address;
  mintBurnOFT?: Address;
  riseXComposer?: Address;
  collateralManager?: Address;
}

export const CONTRACTS: Record<number, ChainContracts> = {
  11155111: {
    globalDeposit: "0xc65a83A9E93445a161081560cd1258e03825d0F2",
    lockReleaseOFT: "0xEd4BCAed9Ae43008bb97189B000515D03d833B3C",
  },
  11155931: {
    usdcMintBurnAdapter: "0x757b75E51E73384D53b80Aa7b92474858104d6Ea",
    mintBurnOFT: "0x7D2fAdBcDD33dA1fCd3Ae09de89E5F21D9050e27",
    riseXComposer: "0x9BF8053c29C533B6238fC4e72a97Eca8016501dd",
    collateralManager: "0x158fefb2d5635fbecf06ccb1a5129a61abf53753",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function getTokenAddress(
  tokenKey: string,
  chainId: number
): Address | undefined {
  return TOKENS[tokenKey]?.addresses[chainId];
}

export function getGlobalDepositAddress(chainId: number): Address | undefined {
  return CONTRACTS[chainId]?.globalDeposit;
}

/**
 * Rebuild composer + composeMsg from session fields.
 * This ensures retry always has compose data, even for sessions
 * created before we started storing it.
 *
 * @param feeBps - protocol fee in basis points (default 50 = 0.5%). 
 *                 Query from GlobalDeposit.getFeeConfig() for accuracy.
 */
export function buildComposeData(
  session: {
    destChainId: number;
    tokenKey: string;
    amount: string;
    userAddress: string;
  },
  feeBps: bigint = 50n,
): { composer: string; composeMsg: string } {
  const destContracts = CONTRACTS[session.destChainId];
  const composerAddr = destContracts?.riseXComposer ?? "0x9BF8053c29C533B6238fC4e72a97Eca8016501dd";
  const collateralMgr = destContracts?.collateralManager ?? "0x158fefb2d5635fbecf06ccb1a5129a61abf53753";
  const destUsdcAddr = getTokenAddress(session.tokenKey, session.destChainId);
  const decimals = TOKENS[session.tokenKey]?.decimals ?? 6;
  const grossAmount = parseUnits(session.amount, decimals);

  // Compute net amount after protocol fee deduction
  const protocolFee = (grossAmount * feeBps) / 10000n;
  const netAmount = grossAmount - protocolFee;

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
      session.userAddress as Address,
      (destUsdcAddr ?? "0x6bf6e258b3c5650b448cb1112835048ba5619dc1") as Address,
      netAmount, // post-fee amount — only this much arrives on destination
    ],
  });

  const composeMsg = encodeAbiParameters(
    parseAbiParameters("address receiver, address target, bytes data"),
    [
      session.userAddress as Address,
      collateralMgr as Address,
      depositCalldata,
    ],
  );

  return { composer: composerAddr, composeMsg };
}
