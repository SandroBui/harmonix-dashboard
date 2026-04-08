# Safe Transactions

Navigate to `/safe-transactions`.

## Overview

Every write action in the dashboard is submitted as a **Safe multisig proposal**. It is not executed on-chain until the required number of owners sign it. This page shows all pending proposals across all four role Safes in a single unified list.

## What you see

Each transaction card shows:

| Element | Description |
|---|---|
| **#nonce** | Queue position within the Safe |
| **Summary** | Human-readable description of the action (e.g. "Fulfill 1 withdrawal(s) — 12.28 USDT") |
| **Role badge** | The role required for this action (Operator / Curator / Price Updater / Admin) |
| **Asset chip** | For fulfillment transactions — the asset being redeemed |
| **Safe address** | Truncated address of the Safe + threshold (e.g. `0xf07f…3418 · 2/7`) |
| **Confirmation count** | How many owners have signed vs. how many are required |

## Actions

Expand a transaction card to see full details and available actions.

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

Propose a zero-value self-call at the same nonce to block the original transaction. After proposing, the rejection itself must reach threshold and be executed to finalise the cancellation.

## Transaction lifecycle

```
Propose  →  Sign (repeat until threshold)  →  Execute
                                    ↓
                             Cancel (optional)
                                    ↓
                        Sign rejection → Execute rejection
```

## Tips

- Transactions are sorted by nonce ascending — execute lower nonces first.
- If a transaction is stuck, use **Cancel Transaction** to clear the nonce.
- After proposing from any page, the link "View pending transactions" takes you here directly.
- Click **Refresh all** to force-fetch the latest state from the Safe Transaction Service.
