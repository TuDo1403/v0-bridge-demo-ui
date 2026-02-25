export const riseGlobalDepositAbi = [
  {
    type: "function",
    name: "computeDepositAddress",
    inputs: [{ name: "recipient", type: "address" }],
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
    name: "rescueFunds",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
