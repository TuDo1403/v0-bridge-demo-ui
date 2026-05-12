# Rise Bridge — Backend API & Integration Guide

## Overview

The frontend communicates with the backend bridge operator via Next.js API proxy routes.
All backend requests go through `lib/api-proxy.ts` which adds auth headers and handles timeouts.

Backend base URL: `BRIDGE_API_URL` env var (default: `http://127.0.0.1:8080`)
Authentication: `X-API-Key` header from `BRIDGE_API_KEY` env var

---

## Active Endpoints

### 1. POST /v1/bridge/process
Submit a new bridge job for the operator to process.

**Proxy route:** `/api/bridge/process`

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sourceChainId | number | Yes | Source chain ID (e.g., 11155111 for Sepolia) |
| destChainId | number | Yes | Destination chain ID (e.g., 11155931 for RISE) |
| userTransferTxHash | string | Yes | Tx hash of user's vault transfer, or `"permit2"` for permit2 flow |
| token | string | Yes | Token contract address on source chain |
| receiver | string | Yes | Recipient address on destination chain |
| dappId | number | No | Dapp routing ID (0 = direct bridge, 1 = RiseX Composer). Default: 0 |
| permit | object | No | Permit2 data (see below) |

**Permit object (when transferMode=permit2):**
| Field | Type | Description |
|-------|------|-------------|
| permitType | number | 0 = VaultFunded, 1 = Permit2 |
| deadline | string | Stringified bigint — permit expiry timestamp |
| nonce | string | Stringified bigint — Permit2 nonce |
| signature | string | Hex-encoded EIP-712 signature |

**Response (200):**
| Field | Type | Description |
|-------|------|-------------|
| jobId | string | Unique job ID for status polling |
| status | string | Initial status (typically `"source_verified"`) |
| depositAddress | string | The deterministic vault address |
| backendProcessTxHash | string\|null | Tx hash of the backend's bridge call |

**Error (409):** Duplicate transfer already submitted

### 2. GET /v1/bridge/status/{jobId}
Poll status of a bridge job.

**Proxy route:** `/api/bridge/status?jobId={jobId}`

**Response (200):**
| Field | Type | Description |
|-------|------|-------------|
| jobId | string | Job ID |
| status | string | One of: `source_verified`, `bridge_submitted`, `bridge_mined`, `lz_indexing`, `lz_pending`, `completed`, `failed` |
| userTransferTxHash | string | User's source chain tx |
| backendProcessTxHash | string\|null | Backend's bridge tx |
| lzMessageId | string\|null | LayerZero message GUID |
| destinationTxHash | string\|null | Destination chain tx hash |
| composeStatus | string\|null | Compose execution status (`SUCCEEDED`/`FAILED`/`NOT_EXECUTED`) |
| composeTxHash | string\|null | Compose execution tx hash |
| sender | string\|null | Source chain sender |
| receiver | string | Destination chain receiver |
| token | string | Token address |
| amount | string | Gross amount |
| feeAmount | string\|null | Protocol fee deducted |
| netAmount | string\|null | Amount after fee |
| sourceChainId | number | Source chain |
| dstChainId | number | Destination chain |
| error | string\|null | Error message if failed |

### 3. GET /v1/bridge/status/tx/{hash}
Look up a bridge job by any associated tx hash (user transfer, backend process, destination, compose).

**Proxy route:** `/api/bridge/status-tx?txHash={hash}`

Used by: **Search/Track tab** (`tx-search.tsx`)

**Response (200):** Same as GET /v1/bridge/status/{jobId}
**Response (404):** No job matches the given hash

### 4. GET /v1/bridge/history/{address}?limit=20&offset=0&dappId=0
Get paginated bridge history for a wallet address.

**Proxy route:** `/api/bridge/history?address={addr}&limit=20&offset=0&dappId=0`

Used by: **History tab** (`history-page.tsx`)

**Response (200):** Array of BridgeStatusResponse objects

---

## Deprecated Endpoints (can be removed from backend)

| Endpoint | Reason |
|----------|--------|
| `POST /v1/bridge/address` | Frontend computes addresses via CREATE2 locally |

## Non-API Routes (no backend involvement)

| Route | Purpose |
|-------|---------|
| `/api/lz/lookup` | LZ Scan proxy for self-bridge tracking |
| `/api/recovery/compose-rescue` | Stub for compose failure recovery requests (see Recovery section) |

---

## On-Chain Contract Reads (No Backend Needed)

The frontend reads directly from deployed contracts via RPC. These are NOT backend endpoints — they are `view` calls on the smart contracts. Backend integrators should be aware of these contract interfaces because the frontend depends on them.

### GlobalDeposit (Sepolia: `0x7d09ed69FE463012D99bED997C381304B70CC9cc`)

| Function | Signature | Returns | Purpose |
|----------|-----------|---------|---------|
| `getFeeConfig()` | `() → (uint16 feeBps, uint16 dustBps)` | Fee basis points + dust removal rate | Used for percentage-based fee estimation |
| `getTokenFeeConfig(token)` | `(address) → (uint8 mode, uint64 flatFee)` | Per-token fee mode and flat fee amount | **NEW** — mode: 0=Percentage, 1=Flat. `flatFee` in token decimals (e.g. 500000 = 0.50 USDC) |
| `isFeeExempt(address)` | `(address) → bool` | Whether address is exempt from protocol fees | Checked before displaying fees |
| `quote(token, amount, dappId, srcAddr, dstAddr, composeMsg)` | `(address, uint256, uint256, address, address, bytes) → (uint256 protocolFee, MessagingFee{nativeFee, lzTokenFee})` | Authoritative on-chain fee quote | Returns exact `protocolFee` (in token units) and `nativeFee` (LZ gas in ETH). **This is the source of truth for fee display.** |
| `computeDepositAddress(srcAddr, dstAddr, dappId)` | `(address, address, uint256) → address` | Predicted vault clone address | Cross-check for local CREATE2 computation |
| `getVaultImpl(dappId)` | `(uint256) → address` | Vault implementation address for a dapp | Used in local CREATE2 address derivation |

### GlobalWithdraw (RISE Testnet: `0x4752457F0BF4Bba8A807602B772d6Ec740853e90`)

| Function | Signature | Returns | Purpose |
|----------|-----------|---------|---------|
| `getFeeConfig()` | `() → (uint16 feeBps, uint16 dustBps)` | Fee basis points + dust removal rate | Same as deposit |
| `getTokenFeeConfig(token)` | `(address) → (uint8 mode, uint64 flatFee)` | Per-token fee mode and flat fee amount | **NEW** — same as deposit |
| `isFeeExempt(address)` | `(address) → bool` | Fee exemption check | Same as deposit |
| `quote(token, amount, dstEid, srcAddr, dstAddr)` | `(address, uint256, uint32, address, address) → (uint256 protocolFee, MessagingFee{nativeFee, lzTokenFee})` | On-chain fee quote (no compose for withdrawals) | Note: withdraw `quote()` takes `dstEid` instead of `dappId`+`composeMsg` |
| `computeDepositAddress(srcAddr, dstAddr, dstEid)` | `(address, address, uint32) → address` | Predicted vault clone address | Note: uses `dstEid` not `dappId` |
| `getVaultImplementation(dstEid)` | `(uint32) → address` | Vault implementation address for a destination EID | Used in local CREATE2 computation |
| `getRateLimitConfig(dstEid)` | `(uint32) → (uint256 limit, uint256 window)` | Rate limit for withdrawal lane | Displayed as remaining capacity |
| `currentAmountInFlight(dstEid)` | `(uint32) → uint256` | Amount currently bridging (not yet settled) | Used to compute remaining rate limit |
| `isLanePaused(dstEid)` | `(uint32) → bool` | Whether withdrawal lane is paused | Blocks withdrawal UI when true |

### Vault (deterministic clones at computed addresses)

| Function | Signature | Returns | Purpose |
|----------|-----------|---------|---------|
| `isOwner(account)` | `(address) → bool` | Whether account can call recovery | Gate for recovery UI |
| `getSrcAddress()` | `() → address` | Vault owner address | Displayed in recovery UI |
| `getDstAddress()` | `() → address` | Destination address | Displayed in recovery UI |
| `getDappId()` | `() → uint256` | Dapp routing ID | Displayed in recovery UI |
| `getSrcEid()` | `() → uint32` | Source LayerZero EID | Displayed in recovery UI |
| `getDstEid()` | `() → uint32` | Destination LayerZero EID | Displayed in recovery UI |
| `getFactory()` | `() → address` | Factory that deployed this vault | Informational |
| `rescueERC20(token, to, amount)` | `(address, address, uint256)` | — | Recovery: pull stuck ERC20 tokens to owner |
| `rescueETH(to, amount)` | `(address, uint256)` | — | Recovery: pull stuck native ETH to owner |

### RISExComposer (destination chain)

| Function | Signature | Returns | Purpose |
|----------|-----------|---------|---------|
| `claimFunds(token)` | `(address) → ()` | — | Recovery: claim tokens stuck after failed compose execution (uses `msg.sender` to look up claimable balance) |

---

## Per-Token Fee Config — Integration Notice

**IMPORTANT**: The frontend now supports two fee modes per token. The backend and contracts must agree on the fee configuration.

### Fee Mode Enum
```
0 = Percentage (default)   → fee = amount * feeBps / 10000
1 = Flat                   → fee = flatFee (fixed, in token decimals)
```

### How the Frontend Uses It

1. **Reads `getTokenFeeConfig(token)`** on the router contract (GlobalDeposit or GlobalWithdraw)
2. **Reads `getFeeConfig()`** for the base `feeBps` and `dustBps`
3. **Builds compose message** using the correct `bridgeAmount`:
   - Flat mode: `bridgeAmount = (gross - flatFee) / dustRate * dustRate`
   - Percentage mode: `bridgeAmount = (gross - gross*feeBps/10000) / dustRate * dustRate`
4. **Calls `quote()`** with the real compose message to get authoritative `protocolFee` + `lzFee`
5. **Displays `protocolFee` from `quote()`** — this is the source of truth

### `FeeExceedsAmount` Revert

When `quote()` is called with an amount <= the flat fee, the contract reverts with `FeeExceedsAmount(uint256, uint256)`. The frontend catches this and shows "Amount Below Minimum Fee" — no backend action needed.

### Backend Implications

- **`feeAmount` in status response**: The backend should compute the actual fee charged and return it in the `feeAmount` field of `GET /v1/bridge/status/{jobId}`. For flat-fee tokens, this should be the flat fee amount (not a percentage).
- **`netAmount` in status response**: Should equal `amount - feeAmount`.
- **No change to `POST /v1/bridge/process`**: The frontend sends the same fields. The backend builds the `composeMsg` on-chain using `buildComposeMsg()`, which accounts for the fee mode.

---

## Recovery System

The frontend has a full client-side recovery system. No backend endpoints are required for recovery — all recovery operations are direct on-chain transactions from the user's wallet.

### Recovery Types

| Type | When | Contract Call | Chain |
|------|------|---------------|-------|
| **Vault Rescue** | Tokens sent to vault but bridge never executed (stuck at `transfer_mined`, `deposit_verified`, `failed`, `error`) | `vault.rescueERC20(token, to, amount)` | Source chain |
| **Compose Recovery** | Bridge delivered but compose execution reverted on destination (compose status: `FAILED`/`SIMULATION_REVERTED`) | `composer.claimFunds(token)` | Destination chain |

### Recovery Eligibility (Frontend Logic)

**Vault rescue** — `isVaultRescueEligible(session)`:
- Has `depositAddress` (vault exists)
- Has `userTransferTxHash` (user actually sent tokens)
- Does NOT have `selfBridgeTxHash` or `backendProcessTxHash` (bridge never executed)
- Status is one of: `transfer_mined`, `deposit_verified`, `failed`, `error`

**Compose recovery** — `isComposeRescueNeeded(session)`:
- `dappId > 0` (has compose routing)
- Direction is `deposit` (withdrawals have no compose)
- Compose status contains "fail" or "revert", or session error mentions "compose"

### Recovery Pages

| Route | Description |
|-------|-------------|
| `/recover` | **NEW** — Lookup vault by bridge parameters (source chain, dest chain, addresses, dappId). Reconstructs vault address via CREATE2 + on-chain cross-check. Shows ownership, balances, per-token recovery buttons. |
| `/recover/[address]` | Direct vault recovery by known vault address. Auto-detects which chain the vault is on. |

### Session Status: `recovered`

**NEW**: Sessions that have been recovered through the vault/compose rescue are marked with status `"recovered"` (distinct from `"completed"`). This prevents the misleading "Bridge Complete" success UI from showing on rescued sessions.

The tracking card shows an amber "Recovered" state with the message: "Tokens were recovered from the vault back to your wallet. This session was not bridged."

### Backend Notice for Recovery

- The backend does **not** need to implement any recovery endpoints.
- All recovery is client-side via direct contract calls.
- The stub at `/api/recovery/compose-rescue` is a logging mechanism only — it does **not** trigger any backend action yet. If operator-assisted recovery is needed in the future, this endpoint should forward to a notification/queue system.
- The backend's `composeStatus` field in the status response is critical — the frontend uses it to detect compose failures and show the recovery UI.

---

## Frontend Session Status Machine

```
idle → awaiting_transfer → transfer_submitted → transfer_mined → deposit_verified
     → source_verified → bridge_submitted → bridge_mined
     → lz_indexing → lz_pending → destination_confirmed → completed

Terminal states: completed | recovered | failed | error
```

The `recovered` status is set client-side when the user successfully calls `rescueERC20()` or `claimFunds()`. It is never returned by the backend.

### Backend Status → Frontend Status Mapping

```typescript
const map: Record<string, BridgeStatus> = {
  source_verified:        "source_verified",
  bridge_submitted:       "bridge_submitted",
  bridge_mined:           "bridge_mined",
  lz_indexing:            "lz_indexing",
  lz_pending:             "lz_pending",
  destination_confirmed:  "destination_confirmed",
  completed:              "completed",
  failed:                 "failed",
};
// Unknown status → "error"
```

---

## Flow Diagrams

### Operator + Vault-Funded (Normal Flow)
1. User sends ERC20 to deterministic vault address (on-chain transfer via UI)
2. Frontend detects tx mined, calls `POST /v1/bridge/process`
3. Backend picks up vault balance, calls `deposit()` on GlobalDeposit
4. Frontend polls `GET /v1/bridge/status/{jobId}` every 4s
5. Backend reports status progression: `source_verified` → `bridge_submitted` → `bridge_mined` → `lz_indexing` → `completed`
6. If failed, frontend shows recovery options (if vault rescue eligible)

### Operator + Vault-Funded (Manual Tx Hash)
For cases where the user already transferred tokens to the vault externally (e.g. via Etherscan, or from a lost/crashed session):

1. User fills in bridge parameters (source/dest chain, token, amount, recipient, dappId)
2. User clicks "Bridge" → enters the transfer step showing the vault address
3. Instead of clicking "Send", user pastes an existing transfer tx hash in the **"Already transferred? Paste tx hash"** input
4. Frontend submits the pasted hash directly to `POST /v1/bridge/process`
5. Same flow as normal from step 3 onwards

**Frontend validation**: Before submitting to the backend, the frontend fetches the tx receipt from the source chain RPC and verifies:
- Tx exists and is mined (has a receipt)
- Tx was successful (`status = "success"`, not reverted)
- Receipt contains an ERC20 `Transfer(from, to, amount)` log where `to` matches the expected vault address

If any check fails, the user sees an error and the tx is **not** submitted to the backend.

**Backend implication**: The backend should still validate the `userTransferTxHash` server-side (amount, token, vault match) as a defense-in-depth measure. Frontend validation is a UX convenience — the backend is the authoritative gate.

### Operator + Permit2
1. User signs EIP-712 Permit2 permit in wallet
2. Frontend calls `POST /v1/bridge/process` with permit data + `userTransferTxHash="permit2"`
3. Backend calls `permitWitnessTransferFrom` + `deposit()` atomically
4. Frontend polls `GET /v1/bridge/status/{jobId}` every 4s
5. Same status progression as vault-funded

### Self-Bridge (no backend)
1. User sends ERC20 to vault (vault mode) OR signs permit (permit2 mode)
2. User calls `deposit()`/`withdraw()` directly on GlobalDeposit/GlobalWithdraw
3. Frontend polls LayerZero Scan API (via `/api/lz/lookup` proxy) every 6s
4. No backend endpoints are used

### Recovery (no backend)
1. User visits `/recover` and enters bridge parameters (or uses `/recover/[address]` with known vault)
2. Frontend computes vault address via CREATE2 + on-chain cross-check
3. Frontend reads `vault.isOwner(connectedWallet)` to verify ownership
4. Frontend reads ERC20 balances on the vault
5. User clicks "Recover" → calls `vault.rescueERC20()` from their wallet
6. Session status updated to `"recovered"` in local storage

---

## Chain & Contract Registry

| Chain | Chain ID | LZ EID | GlobalDeposit | GlobalWithdraw |
|-------|----------|--------|---------------|----------------|
| Sepolia | 11155111 | 40161 | `0x7d09ed69FE463012D99bED997C381304B70CC9cc` | — |
| RISE Testnet | 11155931 | 40438 | — | `0x4752457F0BF4Bba8A807602B772d6Ec740853e90` |

| Token | Symbol | Decimals | Sepolia | RISE Testnet |
|-------|--------|----------|---------|--------------|
| USDC | USDC | 6 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `0xcd3981f696EB0E5baD1C573e040B17D701141B5E` |

| Dapp ID | Label | Description |
|---------|-------|-------------|
| 0 | Direct Bridge | Standard bridge transfer (no compose) |
| 1 | RiseX Composer | Bridge + auto-deposit to RiseX collateral |
