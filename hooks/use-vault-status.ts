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
  const mountedRef = useRef(true);
  const pollingStartedRef = useRef(false);
  const onJobDetectedRef = useRef(onJobDetected);
  onJobDetectedRef.current = onJobDetected;

  const cleanup = useCallback(() => {
    mountedRef.current = false;
    pollingStartedRef.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent onclose from restarting polling
      wsRef.current.onerror = null;
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
    if (!mountedRef.current) return;
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

    mountedRef.current = true;
    pollingStartedRef.current = false;

    function startPolling() {
      if (pollingStartedRef.current || !mountedRef.current) return;
      pollingStartedRef.current = true;
      wsRef.current = null;

      const poll = async () => {
        if (!mountedRef.current) return;
        try {
          const resp = await pollVaultStatus(eid, vaultAddress, token, network);
          if (!mountedRef.current) return;
          handleStatus(resp);
          if (resp.status === "completed" || resp.status === "failed") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : "Poll failed");
        }
      };

      poll();
      pollRef.current = setInterval(poll, 2000);
    }

    // Try WebSocket first.
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/api/bridge/ws/vault/${eid}/${vaultAddress}?token=${token}&net=${network}`;

    let ws: WebSocket;
    let fallbackTimer: ReturnType<typeof setTimeout>;
    let wsErrored = false;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      fallbackTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN && !wsErrored) {
          wsErrored = true;
          ws.onclose = null;
          ws.close();
          startPolling();
        }
      }, 3000);

      ws.onopen = () => {
        clearTimeout(fallbackTimer);
        if (!mountedRef.current) { ws.close(); return; }
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const resp: VaultStatusResponse = JSON.parse(event.data);
          handleStatus(resp);
          if (resp.status === "timeout" || resp.status === "completed" || resp.status === "failed") {
            cleanup();
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        if (!wsErrored && lastStatusRef.current !== "completed" && lastStatusRef.current !== "failed") {
          startPolling();
        }
      };

      ws.onerror = () => {
        if (wsErrored) return;
        wsErrored = true;
        clearTimeout(fallbackTimer);
        ws.onclose = null; // prevent double startPolling
        ws.close();
        if (mountedRef.current) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      clearTimeout(fallbackTimer!);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, eid, vaultAddress, token, network]);

  return { status, error, connected, stopPolling: cleanup };
}
