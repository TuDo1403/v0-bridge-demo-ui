export function isAllowedWebSocketProxyOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (!originHeader || !hostHeader) {
    return false;
  }

  try {
    const origin = new URL(originHeader);
    const requestHost = normalizeHostForOrigin(hostHeader, origin.protocol);
    return requestHost !== null && origin.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function normalizeHostForOrigin(hostHeader: string, protocol: string): string | null {
  const host = hostHeader.trim();
  if (!host) {
    return null;
  }
  try {
    return new URL(`${protocol}//${host}`).host.toLowerCase();
  } catch {
    return null;
  }
}

export function buildBackendWebSocketUrl(
  baseUrl: string,
  eid: string,
  vaultAddress: string,
  token: string,
): string {
  const wsBase = baseUrl.replace(/^http/i, "ws");
  return `${wsBase}/v1/bridge/ws/vault/${eid}/${vaultAddress}?token=${token}`;
}

export function buildBackendWebSocketHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  return { "X-API-Key": apiKey };
}
