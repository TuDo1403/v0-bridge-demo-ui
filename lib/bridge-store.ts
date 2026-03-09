import { create } from "zustand";
import type { BridgeSession, BridgeStatus } from "./types";
import { BRIDGE_ROUTES_BY_NETWORK } from "@/config/chains";
import { getBridgeDirection, type BridgeDirection, type BridgeMode, type TransferMode } from "@/config/contracts";
import { type NetworkId } from "@/lib/network-store";

/** Read the persisted network to determine initial defaults */
function getInitialNetwork(): NetworkId {
  if (typeof window === "undefined") return "mainnet";
  try {
    const stored = localStorage.getItem("rise-bridge-network");
    if (stored === "testnet" || stored === "mainnet") return stored;
  } catch {
    // ignore
  }
  return "mainnet";
}

function getInitialRoutes() {
  const network = getInitialNetwork();
  return BRIDGE_ROUTES_BY_NETWORK[network];
}

/* ------------------------------------------------------------------ */
/*  LocalStorage helpers                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "rise-bridge-sessions";

function loadSessions(): BridgeSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: BridgeSession[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep last 20 sessions
    const trimmed = sessions.slice(-20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Store interface                                                    */
/* ------------------------------------------------------------------ */

interface BridgeStore {
  // Form state
  sourceChainId: number;
  destChainId: number;
  tokenKey: string;
  amount: string;
  depositAddress: string;
  /** Bridge direction derived from source chain */
  direction: BridgeDirection;
  /** Dapp ID for compose routing (deposit-only, 0 = direct bridge) */
  dappId: number;
  /** Custom recipient address (empty = self-bridge using connected wallet) */
  recipientAddress: string;
  /** Who pays LZ cross-chain gas: operator (backend) or self (user) */
  bridgeMode: BridgeMode;
  /** How tokens move: vault (ERC20 transfer) or permit2 (signature) */
  transferMode: TransferMode;

  // Active session
  activeSession: BridgeSession | null;
  /** Incremented every time setActiveSession is called to force effect re-runs */
  sessionSelectedAt: number;
  recentSessions: BridgeSession[];

  // Actions
  setSourceChainId: (id: number) => void;
  setDestChainId: (id: number) => void;
  setTokenKey: (key: string) => void;
  setAmount: (amount: string) => void;
  setDepositAddress: (addr: string) => void;
  setDappId: (id: number) => void;
  setRecipientAddress: (addr: string) => void;
  setBridgeMode: (mode: BridgeMode) => void;
  setTransferMode: (mode: TransferMode) => void;

  /** Swap source and destination chains */
  swapDirection: () => void;

  // Session management
  createSession: (params: {
    userAddress: string;
    recipientAddress: string;
    depositAddress: string;
  }) => BridgeSession;
  updateSession: (id: string, updates: Partial<BridgeSession>) => void;
  setActiveSession: (session: BridgeSession | null) => void;
  loadRecentSessions: () => void;

  // Remove session (for phantom/cancelled sessions)
  removeSession: (id: string) => void;

  // Reset
  resetForm: () => void;
}

export const useBridgeStore = create<BridgeStore>((set, get) => ({
  sourceChainId: getInitialRoutes()[0]?.sourceChainId ?? 1,
  destChainId: getInitialRoutes()[0]?.destChainId ?? 4153,
  tokenKey: "USDC",
  amount: "",
  depositAddress: "",
  direction: "deposit",
  dappId: 0,
  recipientAddress: "",
  bridgeMode: "operator",
  transferMode: "vault",

  activeSession: null,
  sessionSelectedAt: 0,
  recentSessions: [],

  setSourceChainId: (id) => set({ sourceChainId: id }),
  setDestChainId: (id) => set({ destChainId: id }),
  setTokenKey: (key) => set({ tokenKey: key }),
  setAmount: (amount) => set({ amount }),
  setDepositAddress: (addr) => set({ depositAddress: addr }),
  setDappId: (id) => set({ dappId: id, depositAddress: "" }),
  setRecipientAddress: (addr) => set({ recipientAddress: addr, depositAddress: "" }),
  setBridgeMode: (mode) => set({ bridgeMode: mode }),
  setTransferMode: (mode) => set({ transferMode: mode }),

  swapDirection: () => {
    const { sourceChainId, destChainId } = get();
    const newDirection = getBridgeDirection(destChainId);
    set({
      sourceChainId: destChainId,
      destChainId: sourceChainId,
      direction: newDirection,
      depositAddress: "", // reset since address changes per direction
      dappId: 0, // reset dapp on direction swap
    });
  },

  createSession: ({ userAddress, recipientAddress, depositAddress }) => {
    const state = get();
    const session: BridgeSession = {
      id: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      sourceChainId: state.sourceChainId,
      destChainId: state.destChainId,
      tokenKey: state.tokenKey,
      amount: state.amount,
      userAddress,
      recipientAddress,
      depositAddress,
      status: "awaiting_transfer" as BridgeStatus,
      direction: state.direction,
      dappId: state.dappId,
      bridgeMode: state.bridgeMode,
      transferMode: state.transferMode,
    };

    const sessions = [...get().recentSessions, session];
    saveSessions(sessions);

    set({ activeSession: session, recentSessions: sessions });
    return session;
  },

  updateSession: (id, updates) => {
    // Ensure sessions are loaded from localStorage first (guards against race condition
    // where updateSession is called before loadRecentSessions effect runs)
    let current = get().recentSessions;
    if (current.length === 0) {
      current = loadSessions();
    }
    const sessions = current.map((s) => {
      if (s.id !== id) return s;
      // Deep-merge lzTracking so we never lose fields
      const merged = { ...s, ...updates };
      if (updates.lzTracking && s.lzTracking) {
        merged.lzTracking = { ...s.lzTracking, ...updates.lzTracking };
      }
      return merged;
    });
    saveSessions(sessions);

    const active = get().activeSession;
    let updatedActive = active;
    if (active?.id === id) {
      updatedActive = { ...active, ...updates };
      if (updates.lzTracking && active.lzTracking) {
        updatedActive!.lzTracking = { ...active.lzTracking, ...updates.lzTracking };
      }
    }

    set({ recentSessions: sessions, activeSession: updatedActive });
  },

  setActiveSession: (session) => {
    if (session) {
      // Restore form fields from the session so hooks (quote, compose, etc.) work correctly
      set({
        activeSession: session,
        sessionSelectedAt: Date.now(),
        sourceChainId: session.sourceChainId,
        destChainId: session.destChainId,
        tokenKey: session.tokenKey,
        amount: session.amount,
        depositAddress: session.depositAddress,
        direction: session.direction ?? getBridgeDirection(session.sourceChainId),
        dappId: session.dappId ?? 0,
        recipientAddress: session.recipientAddress ?? "",
        bridgeMode: session.bridgeMode ?? "operator",
        transferMode: session.transferMode ?? "vault",
      });
    } else {
      set({ activeSession: null, sessionSelectedAt: Date.now() });
    }
  },

  loadRecentSessions: () => {
    const sessions = loadSessions();
    set({ recentSessions: sessions });
  },

  removeSession: (id) => {
    const sessions = get().recentSessions.filter((s) => s.id !== id);
    saveSessions(sessions);
    const active = get().activeSession;
    set({
      recentSessions: sessions,
      activeSession: active?.id === id ? null : active,
    });
  },

  resetForm: () =>
    set({
      amount: "",
      recipientAddress: "",
      activeSession: null,
    }),
}));
