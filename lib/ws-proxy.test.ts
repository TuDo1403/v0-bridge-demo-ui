import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackendWebSocketHeaders,
  buildBackendWebSocketUrl,
  isAllowedWebSocketProxyOrigin,
} from "./ws-proxy";

test("allows same-host websocket proxy origins", () => {
  assert.equal(
    isAllowedWebSocketProxyOrigin("https://bridge.riselabs.xyz", "bridge.riselabs.xyz"),
    true,
  );
  assert.equal(
    isAllowedWebSocketProxyOrigin("https://bridge.riselabs.xyz", "bridge.riselabs.xyz:443"),
    true,
  );
  assert.equal(
    isAllowedWebSocketProxyOrigin("http://localhost", "localhost:80"),
    true,
  );
  assert.equal(
    isAllowedWebSocketProxyOrigin("http://localhost:3000", "localhost:3000"),
    true,
  );
});

test("rejects missing or cross-site websocket proxy origins", () => {
  assert.equal(isAllowedWebSocketProxyOrigin(undefined, "bridge.riselabs.xyz"), false);
  assert.equal(
    isAllowedWebSocketProxyOrigin("https://evil.example", "bridge.riselabs.xyz"),
    false,
  );
});

test("builds backend websocket target without leaking api_key in query params", () => {
  const url = buildBackendWebSocketUrl(
    "https://backend.example",
    "30101",
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  );
  assert.equal(
    url,
    "wss://backend.example/v1/bridge/ws/vault/30101/0x1111111111111111111111111111111111111111?token=0x2222222222222222222222222222222222222222",
  );
  assert.equal(url.includes("api_key="), false);
});

test("sends backend websocket auth in headers only when configured", () => {
  assert.deepEqual(buildBackendWebSocketHeaders("secret"), { "X-API-Key": "secret" });
  assert.deepEqual(buildBackendWebSocketHeaders(""), {});
});
