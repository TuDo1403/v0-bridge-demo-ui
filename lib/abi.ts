export const riseGlobalDepositAbi = [
  {
    type: "function",
    name: "computeDepositAddress",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dappId", type: "uint16" },
    ],
    outputs: [{ name: "depositAddress", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteBridge",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "composer", type: "address" },
      { name: "composeMsg", type: "bytes" },
    ],
    outputs: [
      { name: "protocolFee", type: "uint256" },
      {
        name: "lzFee",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenConfig",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "oft", type: "address" },
          { name: "enabled", type: "bool" },
          { name: "lzReceiveGas", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getComposerConfig",
    inputs: [{ name: "composer", type: "address" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "enabled", type: "bool" },
          { name: "lzComposeGas", type: "uint128" },
          { name: "validator", type: "address" },
          { name: "strict", type: "bool" },
          { name: "maxMsgBytes", type: "uint32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeeConfig",
    inputs: [],
    outputs: [
      { name: "feeBps", type: "uint16" },
      { name: "feeCollector", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenFeeConfig",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "mode", type: "uint8" },
      { name: "flatFee", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDstEid",
    inputs: [],
    outputs: [{ name: "dstEid", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountVaultImplementation",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDapp",
    inputs: [{ name: "dappId", type: "uint16" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "vaultImpl", type: "address" },
          { name: "composer", type: "address" },
          { name: "lzComposeGas", type: "uint40" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultImpl",
    inputs: [{ name: "dappId", type: "uint16" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isDappTokenSupported",
    inputs: [
      { name: "dappId", type: "uint16" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSrcEid",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buildComposeMsg",
    inputs: [
      { name: "dappId", type: "uint16" },
      { name: "dstAddress", type: "address" },
      { name: "srcToken", type: "address" },
      { name: "bridgeAmount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      {
        name: "param",
        type: "tuple",
        components: [
          { name: "srcAddress", type: "address" },
          { name: "dstAddress", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "composeMsg", type: "bytes" },
          { name: "nativeFee", type: "uint256" },
          {
            name: "permit",
            type: "tuple",
            components: [
              { name: "permitType", type: "uint8" },
              { name: "deadline", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "signature", type: "bytes" },
            ],
          },
        ],
      },
      { name: "token", type: "address" },
      { name: "dappId", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "quote",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dappId", type: "uint16" },
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "composeMsg", type: "bytes" },
    ],
    outputs: [
      { name: "protocolFee", type: "uint256" },
      {
        name: "lzFee",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rescueFunds",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dappId", type: "uint16" },
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rescueETH",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dappId", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isBlocked",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isFeeAllowlisted",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "DepositProcessed",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  { type: "error", name: "EmptyComposeMsg", inputs: [] },
  {
    type: "error",
    name: "ComposeMsgTooLarge",
    inputs: [
      { name: "length", type: "uint256" },
      { name: "maxBytes", type: "uint32" },
    ],
  },
  { type: "error", name: "ZeroBridgeAmount", inputs: [] },
] as const;

/** ABI for RiseGlobalWithdraw contract */
export const riseGlobalWithdrawAbi = [
  {
    type: "function",
    name: "computeDepositAddress",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [{ name: "depositAddress", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenConfig",
    inputs: [
      { name: "token", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "oft", type: "address" },
          { name: "enabled", type: "bool" },
          { name: "lzReceiveGas", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeeConfig",
    inputs: [],
    outputs: [
      { name: "feeBps", type: "uint16" },
      { name: "feeCollector", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenFeeConfig",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "mode", type: "uint8" },
      { name: "flatFee", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRateLimitBucket",
    inputs: [
      { name: "token", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [
      {
        name: "bucket",
        type: "tuple",
        components: [
          { name: "lastBlock", type: "uint64" },
          { name: "available", type: "uint128" },
          { name: "capacity", type: "uint128" },
          { name: "refillPerBlock", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLaneRateLimitBucket",
    inputs: [{ name: "dstEid", type: "uint32" }],
    outputs: [
      {
        name: "bucket",
        type: "tuple",
        components: [
          { name: "lastBlock", type: "uint64" },
          { name: "available", type: "uint128" },
          { name: "capacity", type: "uint128" },
          { name: "refillPerBlock", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isLanePaused",
    inputs: [{ name: "dstEid", type: "uint32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLanes",
    inputs: [],
    outputs: [{ name: "", type: "uint32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVaultImplementation",
    inputs: [{ name: "dstEid", type: "uint32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSrcEid",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      {
        name: "param",
        type: "tuple",
        components: [
          { name: "srcAddress", type: "address" },
          { name: "dstAddress", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nativeFee", type: "uint256" },
          {
            name: "permit",
            type: "tuple",
            components: [
              { name: "permitType", type: "uint8" },
              { name: "deadline", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "signature", type: "bytes" },
            ],
          },
        ],
      },
      { name: "token", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "quote",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dstEid", type: "uint32" },
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
    ],
    outputs: [
      { name: "protocolFee", type: "uint256" },
      {
        name: "lzFee",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isBlocked",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isFeeAllowlisted",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rescueFunds",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dstEid", type: "uint32" },
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rescueETH",
    inputs: [
      { name: "srcAddress", type: "address" },
      { name: "dstAddress", type: "address" },
      { name: "dstEid", type: "uint32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** Minimal ABI for OFT conversion rate query */
export const oftConversionRateAbi = [
  {
    type: "function",
    name: "decimalConversionRate",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

/** ABI for RiseVault clone — direct recovery via Lifebuoy rescue functions */
export const riseVaultAbi = [
  {
    type: "function",
    name: "rescueERC20",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "rescueETH",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "isOwner",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSrcAddress",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDstAddress",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFactory",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSrcEid",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDstEid",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDappId",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
  },
] as const;

/** ABI for RISExComposer (dest chain compose recovery + token check) */
export const riseXComposerAbi = [
  {
    type: "function",
    name: "claimFunds",
    inputs: [
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isProtectedToken",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;
