# Safe Transactions

Navigate to `/safe-transactions`.

## Overview

Every write action in the dashboard is submitted as a **Safe multisig proposal**. It is not executed on-chain until the required number of owners sign it. This page shows Safe multisig activity for the Safe picked in the toolbar, with lifecycle tabs:

| Tab | What it shows |
|---|---|
| **Pending** | Unexecuted multisig proposals (queue to sign / execute / cancel), 10 per page with Load more |
| **History** | All multisig txs for the selected Safe (pending + executed), grouped by calendar day, newest first within each day, 10 per page with Load more |

These tabs are fed by the Safe Transaction Service (via the dashboard `/api/safe/[chainId]` proxy). They are **not** the same as Action History on `/status` (on-chain event log) — the two views are complementary.

The header shows the active vault's **network** from `config.chainId` via the map in `lib/networks.ts`. Signing and execution stay on the vault chain (HyperEVM / `999` for current vaults); reads for a selected Safe use that Safe's own `chainId`.

## Safe wallet selector

The toolbar has a **Safe wallet** dropdown, compiled from the active vault's `safe` block in `lib/vaults.config.ts` — role Safes (Default / Operator / Curator / Admin / Timelock Proposer) plus every entry in `safe.strategyWallets`. Each configured entry is listed, so several labels may point at the same address.

Exactly one Safe is shown at a time. The tabs always query the Transaction Service for **that Safe's chain only** (`strategyWallets[].chainId`, or the vault `chainId` when omitted) — never another deployment that happens to share the address.

### Safes on other chains

A strategy wallet may set `chainId` (see `docs/roles-and-safes.md`) when its Safe lives off the vault chain. Those entries are labelled with the network name in the dropdown and stay **read-only** here (sign/execute in the Safe app). Explorer links follow the Safe's chain.

The selector applies to every lifecycle tab. Your pick is remembered per vault in `localStorage`, so a reload comes back to the same Safe; switching vaults restores that vault's own last pick. Without a stored pick the first configured Safe is used, and a vault with no Safe at all shows an empty selector.

## What you see

**Pending** tab — expandable cards with summary, role/status badges, confirmation count, and sign/execute/cancel actions.

**History** tab — compact rows grouped under date headers (e.g. `APR 20, 2026`). Each row shows a sequential index, summary, time, and status (`Success` / `Failed` / `Pending`). Expand a row for full detail, decoded calldata, and explorer links.

Row titles use Harmonix extras when present: **protocol name - contract name - action**, with placeholders filled from decoded parameters. `{0}` / `{param}` insert the raw value (addresses truncated). `{0/6}` / `{param/6}` scale a numeric param by the given decimals (e.g. `Update management fee to {0/6}%` with `1000000` → `Update management fee to 1%`). Cancellations stay labelled `Cancellation`. Without those extras the existing method summary is used.

Expanded detail shows decoded method/params, then metadata: **To** is `protocol name - contract name` plus a truncated target address with a copy button (Value and Operation are omitted).

| Element | Pending | History |
|---|---|---|
| **Summary / method** | Protocol - contract - action (or local summary) | Same title format (or `Cancellation`) |
| **Status** | Pending / Executed / Failed badge | Success / Failed / Pending (text) |
| **Role badge** | Shown on card | Shown in expanded detail |
| **Safe address** | Truncated + threshold | Expanded detail |
| **Confirmation count** | Signed vs required | Expanded detail |
| **Execution time / tx hash** | When available | Time on row; hash in expanded detail |

Expand a card for decoded calldata (Harmonix decode API → Safe Transaction Service decoder → local ABI fallback → `multiSend` inner expand). Harmonix SUCCESS payloads use `function.name` plus a `parameters` object (not a Safe-style `{ method, parameters[] }`); the dashboard maps that envelope as-is. ABI JSON is shown when the decoder returns `abi`. Unknown calldata shows raw hex.

## Status badges

History row status labels:

- **Success** — executed and successful, and not a rejection.
- **Failed** — executed on-chain with `isSuccessful === false`, or an executed **rejection/cancel** (zero-value self-call with empty/`0x` data) that cleared a nonce — even if the rejection itself succeeded on-chain.
- **Pending** — not yet executed.

Pending cards use **Pending / Executed / Failed** badge styling for the same buckets.

## Actions

Sign / Execute / Cancel are available on the **Pending** tab only. History is display-only.

### Sign (confirm)

Add your signature to a pending transaction. Available when:

- Your wallet is connected.
- Your wallet is an owner of the Safe.
- You have not already signed this transaction.
- The threshold has not yet been reached.

### Execute

Send the transaction on-chain. Available when:

- The required number of signatures has been collected (threshold met — shown as "✓ Ready").
- Your wallet is a Safe owner.

### Cancel (reject)

Propose a zero-value self-call at the same nonce to block the original transaction. After proposing, the rejection itself must reach threshold and be executed to finalise the cancellation. Executed rejections appear under **History** with a Failed badge.

## Transaction lifecycle

```
Propose  →  Sign (repeat until threshold)  →  Execute  →  History (Executed)
                                    ↓
                             Cancel (optional)
                                    ↓
                        Sign rejection → Execute rejection  →  History (Failed)
```

## Tips

- Pending transactions are sorted by nonce ascending — execute lower nonces first.
- History is sorted newest first and grouped by local calendar day (`executionDate`, or `submissionDate` when not yet executed).
- If a transaction is stuck, use **Cancel Transaction** on Pending to clear the nonce.
- After proposing from any page, the link "View pending transactions" takes you here directly.
- Click **Refresh** to re-fetch the active tab from the Safe Transaction Service without a full page reload.
- Use **Load more** on any tab to paginate (10 items per page against the Transaction Service).
