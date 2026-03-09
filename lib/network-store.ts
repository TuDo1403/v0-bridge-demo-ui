import { create } from "zustand";

/* ------------------------------------------------------------------ */
/*  Network type                                                       */
/* ------------------------------------------------------------------ */

export type NetworkId = "testnet" | "mainnet";

/* ------------------------------------------------------------------ */
/*  Chain ID constants per network                                     */
/* ------------------------------------------------------------------ */

export const NETWORK_CHAIN_IDS: Record<NetworkId, { eth: number; rise: number }> = {
  testnet: { eth: 11155111, rise: 11155931 },
  mainnet: { eth: 1, rise: 4153 },
};

/** Set of all RISE chain IDs (testnet + mainnet) for direction detection */
export const RISE_CHAIN_IDS = new Set([11155931, 4153]);

/* ------------------------------------------------------------------ */
/*  LocalStorage persistence                                           */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "rise-bridge-network";

function loadNetwork(): NetworkId {
  if (typeof window === "undefined") return "mainnet";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "testnet" || stored === "mainnet") return stored;
  } catch {
    // ignore
  }
  return "mainnet";
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface NetworkStore {
  network: NetworkId;
  setNetwork: (network: NetworkId) => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  network: loadNetwork(),
  setNetwork: (network) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, network);
    }
    set({ network });
  },
}));
