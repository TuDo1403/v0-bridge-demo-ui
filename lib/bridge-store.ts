import { create } from "zustand";
import type { BridgeSession, BridgeStatus } from "./types";
import { BRIDGE_ROUTES } from "@/config/chains";

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

  // Session management
  createSession: (params: {
    userAddress: string;
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
  sourceChainId: BRIDGE_ROUTES[0]?.sourceChainId ?? 11155111,
  destChainId: BRIDGE_ROUTES[0]?.destChainId ?? 11155931,
  tokenKey: "USDC",
  amount: "",
  depositAddress: "",

  activeSession: null,
  sessionSelectedAt: 0,
  recentSessions: [],

  setSourceChainId: (id) => set({ sourceChainId: id }),
  setDestChainId: (id) => set({ destChainId: id }),
  setTokenKey: (key) => set({ tokenKey: key }),
  setAmount: (amount) => set({ amount }),
  setDepositAddress: (addr) => set({ depositAddress: addr }),

  createSession: ({ userAddress, depositAddress }) => {
    const state = get();
    const session: BridgeSession = {
      id: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      sourceChainId: state.sourceChainId,
      destChainId: state.destChainId,
      tokenKey: state.tokenKey,
      amount: state.amount,
      userAddress,
      depositAddress,
      status: "awaiting_transfer" as BridgeStatus,
    };

    const sessions = [...get().recentSessions, session];
    saveSessions(sessions);

    set({ activeSession: session, recentSessions: sessions });
    return session;
  },

  updateSession: (id, updates) => {
    const sessions = get().recentSessions.map((s) => {
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

  setActiveSession: (session) => set({ activeSession: session, sessionSelectedAt: Date.now() }),

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
      activeSession: null,
    }),
}));
