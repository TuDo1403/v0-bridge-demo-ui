/**
 * Custom Next.js server with WebSocket proxy for vault status subscriptions.
 *
 * The WS proxy handles UPGRADE requests on /api/bridge/ws/vault/:eid/:vaultAddress
 * and proxies them to the backend gateway WS endpoint, injecting the API key
 * so it never reaches the browser.
 *
 * Usage:
 *   npx tsx server.ts          (dev)
 *   node .next/standalone/server.js  (prod, with output: "standalone")
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";

import {
  buildBackendWebSocketHeaders,
  buildBackendWebSocketUrl,
  isAllowedWebSocketProxyOrigin,
} from "./lib/ws-proxy";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const BRIDGE_API_MAINNET = process.env.BRIDGE_API_URL_MAINNET ?? process.env.BRIDGE_API_URL ?? "http://127.0.0.1:8080";
const BRIDGE_API_TESTNET = process.env.BRIDGE_API_URL_TESTNET ?? process.env.BRIDGE_API_URL ?? "http://127.0.0.1:8080";
const API_KEY_MAINNET = process.env.BRIDGE_API_KEY_MAINNET ?? process.env.BRIDGE_API_KEY ?? "";
const API_KEY_TESTNET = process.env.BRIDGE_API_KEY_TESTNET ?? process.env.BRIDGE_API_KEY ?? "";

// WS proxy path pattern: /api/bridge/ws/vault/{eid}/{vaultAddress}?token={token}&net={network}
const WS_PATH_RE = /^\/api\/bridge\/ws\/vault\/(\d+)\/(0x[0-9a-fA-F]{40})$/;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  // WebSocket proxy: no auth required from browser — API key injected server-side.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const parsedUrl = parse(req.url ?? "/", true);
    const pathname = parsedUrl.pathname ?? "";

    const match = WS_PATH_RE.exec(pathname);
    if (!match) {
      // Let Next.js handle non-matching upgrades (e.g., HMR webpack-hmr).
      return;
    }

    const eid = match[1];
    const vaultAddress = match[2];
    const token = parsedUrl.query.token as string;
    const net = (parsedUrl.query.net as string) ?? "mainnet";

    if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!isAllowedWebSocketProxyOrigin(req.headers.origin, req.headers.host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    // Build backend WS URL. The proxy authenticates to the backend via
    // header injection so the secret never enters browser-visible URLs.
    const baseUrl = net === "testnet" ? BRIDGE_API_TESTNET : BRIDGE_API_MAINNET;
    const apiKey = net === "testnet" ? API_KEY_TESTNET : API_KEY_MAINNET;
    const backendUrl = buildBackendWebSocketUrl(baseUrl, eid, vaultAddress, token);

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      // Connect to backend WS.
      const backendWs = new WebSocket(backendUrl, {
        headers: buildBackendWebSocketHeaders(apiKey),
      });

      backendWs.on("open", () => {
        wss.emit("connection", clientWs, req);
      });

      // Relay backend → client.
      backendWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data.toString());
        }
      });

      // Relay client → backend (for close/ping).
      clientWs.on("message", (data) => {
        if (backendWs.readyState === WebSocket.OPEN) {
          backendWs.send(data.toString());
        }
      });

      // Close propagation.
      backendWs.on("close", () => clientWs.close());
      clientWs.on("close", () => backendWs.close());

      // Error handling.
      backendWs.on("error", (err) => {
        console.error("[ws-proxy] backend error:", err.message);
        clientWs.close();
      });
      clientWs.on("error", (err) => {
        console.error("[ws-proxy] client error:", err.message);
        backendWs.close();
      });
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
