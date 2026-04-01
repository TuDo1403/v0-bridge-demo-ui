import { useEffect, useRef, useCallback, useState } from "react";
import { pollVaultStatus, type VaultStatusResponse } from "@/lib/bridge-service";

interface UseVaultStatusOptions {
  /** Source chain EID */
  eid: number;
  /** Vault address to monitor */
  vaultAddress: string;
  /** Token address (required to disambiguate) */
  token: string;
  /** Network */
  network: "mainnet" | "testnet";
  /** Whether subscription is active */
  enabled: boolean;
  /** Called when a job is detected (status transitions from "waiting") */
  onJobDetected?: (resp: VaultStatusResponse) => void;
}

/**
 * useVaultStatus subscribes to vault status updates via WebSocket (proxied
 * through the Next.js server), with automatic fallback to 2s HTTP polling
 * if WS fails to connect.
 *
 * Designed for the QR code / external wallet flow where the frontend
 * doesn't have the user's TX hash.
 */
export function useVaultStatus({
  eid,
  vaultAddress,
  token,
  network,
  enabled,
  onJobDetected,
}: UseVaultStatusOptions) {
  const [status, setStatus] = useState<VaultStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string>("");
  const onJobDetectedRef = useRef(onJobDetected);
  onJobDetectedRef.current = onJobDetected;

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setConnected(false);
  }, []);

  const handleStatus = useCallback((resp: VaultStatusResponse) => {
    setStatus(resp);
    setError(null);

    if (lastStatusRef.current === "waiting" && resp.status !== "waiting") {
      onJobDetectedRef.current?.(resp);
    }
    lastStatusRef.current = resp.status;
  }, []);

  useEffect(() => {
    if (!enabled || !eid || !vaultAddress || !token) {
      cleanup();
      return;
    }

    // Try WebSocket first.
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/api/bridge/ws/vault/${eid}/${vaultAddress}?token=${token}&net=${network}`;

    let ws: WebSocket;
    let fallbackTimer: ReturnType<typeof setTimeout>;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // If WS doesn't open within 3s, fall back to polling.
      fallbackTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn("[vault-status] WS connect timeout, falling back to polling");
          ws.close();
          startPolling();
        }
      }, 3000);

      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const resp: VaultStatusResponse = JSON.parse(event.data);
          handleStatus(resp);

          // Server sends {status: "timeout"} when it closes.
          if (resp.status === "timeout" || resp.status === "completed" || resp.status === "failed") {
            cleanup();
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // If closed unexpectedly while still enabled, fall back to polling.
        if (enabled && lastStatusRef.current !== "completed" && lastStatusRef.current !== "failed") {
          startPolling();
        }
      };

      ws.onerror = () => {
        clearTimeout(fallbackTimer);
        console.warn("[vault-status] WS error, falling back to polling");
        ws.close();
        startPolling();
      };
    } catch {
      // WebSocket constructor failed (e.g., CSP block).
      startPolling();
    }

    function startPolling() {
      if (pollRef.current) return; // already polling
      wsRef.current = null;

      const poll = async () => {
        try {
          const resp = await pollVaultStatus(eid, vaultAddress, token, network);
          handleStatus(resp);
          if (resp.status === "completed" || resp.status === "failed") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Poll failed");
        }
      };

      poll(); // immediate first poll
      pollRef.current = setInterval(poll, 2000);
    }

    return () => {
      clearTimeout(fallbackTimer!);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, eid, vaultAddress, token, network]);

  return { status, error, connected, stopPolling: cleanup };
}
