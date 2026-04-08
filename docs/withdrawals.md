# Withdrawals

Navigate to `/withdrawals`.

## Required role

**Operator** — your wallet must be an owner of the Operator Safe, and that Safe must hold `OPERATOR_ROLE` on-chain.

## What you see

A filterable table of all user withdrawal requests with columns:

| Column | Description |
|---|---|
| ID | Sequential queue index |
| Asset | Underlying asset (DAI, USDT, …) |
| Controller | User wallet that submitted the request |
| Shares | Vault shares queued for redemption |
| Assets | Estimated underlying asset amount |
| Requested At | Timestamp of the withdrawal request |
| Status | Pending / Fulfilled |

## Filtering

Use the filter bar to narrow by:
- **Status** — All / Pending / Fulfilled
- **Date range** — start and end date
- **Asset** — one or more specific assets

## Fulfilling withdrawals

1. Switch to **Fulfill** mode (default).
2. Select one or more **pending** rows. All selected rows must belong to the same vault (once you pick the first row, other vaults are locked out).
3. Click **Propose via Safe** in the panel that appears at the bottom.
4. Go to `/safe-transactions` to collect the required co-signatures and execute.

> The panel shows the total asset amount that will be transferred out of the vault.

## Cancelling withdrawals

1. Switch to **Cancel** mode using the toggle above the table.
2. Select the rows you want to cancel.
3. Click **Propose via Safe** in the bottom panel.
4. Sign and execute at `/safe-transactions`.

## Row visibility

- **Full opacity** — selectable in the current mode.
- **60% opacity** — has shares but not selectable in this mode (e.g. a fulfilled row in Fulfill mode).
- **30% opacity** — shares = 0 (already processed or empty).
