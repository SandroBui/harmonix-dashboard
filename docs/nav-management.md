# NAV Management

Navigate to `/admin/nav`.

## What you see

- **Summary cards** — current PPS (Price Per Share), last update time, total NAV.
- **Update NAV** — triggers `VaultManager.updateNav()` to recompute and persist PPS on-chain.
- **Per-asset breakdown** — NAV categories for each registered asset (DAI, USDT, …).

## Required roles

| Action | Role required |
|---|---|
| Sync a category value | Price Updater |
| Trigger updateNav | Price Updater |
| Add a NAV category | Admin |
| Remove a NAV category | Admin |
| Toggle a category active/inactive | Admin |

## Syncing a NAV value

1. Connect your wallet (must be an owner of the Price Updater Safe).
2. Find the category you want to update in the per-asset breakdown.
3. Click **Sync** next to the category.
4. Enter the new NAV value and click **Propose via Safe**.
5. Go to `/safe-transactions` to sign and execute the proposal with the required co-signers.

## Adding a NAV category

1. Connect your wallet (must be an owner of the Admin Safe).
2. Click **Add Category** next to the asset.
3. Enter a description (e.g. `HyperLiquid`) and click **Propose via Safe**.
4. Complete signing at `/safe-transactions`.

## Triggering updateNav

This recomputes the PPS based on all current category values and writes it on-chain.

1. Connect as a Price Updater Safe owner.
2. Click **Update NAV** in the top section.
3. Sign and execute at `/safe-transactions`.

## Access indicator (role banner)

The coloured banner at the top of the page tells you:
- Which Safes are configured for each role.
- Whether the Safe holds the required on-chain role.
- Whether your wallet is a Safe owner.
- Which actions you can propose.
