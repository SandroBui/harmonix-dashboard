# Strategies

Navigate to `/strategies`.

## Required role

**Curator** — your wallet must be an owner of the Curator Safe, and that Safe must hold `CURATOR_ROLE` on-chain.

## What you see

- **Capital overview cards** — per asset: idle capital in FundVault, deployed capital, total managed.
- **Whitelisted strategies table** — all registered strategies per asset with balance, cap, utilization, total in/out.
- **Strategy actions panel** — form to propose any management action.

## Actions

| Action | Description |
|---|---|
| **Add Strategy** | Whitelist a new strategy contract address |
| **Remove Strategy** | Remove a strategy from the whitelist |
| **Set Cap** | Set the maximum capital a strategy can hold |
| **Allocate** | Deploy capital from FundVault into a strategy |
| **Deallocate** | Withdraw capital from a strategy back to FundVault |

## How to propose an action

1. Connect your wallet (must be an owner of the Curator Safe).
2. Click the action tab you want (e.g. **Allocate**).
3. Fill in:
   - **Asset context** (for decimal precision) — select the asset the strategy operates on.
   - **Strategy** — select from the dropdown of whitelisted strategies (or enter an address for Add Strategy).
   - **Amount** — for Set Cap, Allocate, Deallocate.
4. Click **Propose via Safe**.
5. Go to `/safe-transactions` to sign and execute.

## Utilization indicator

The utilization column is colour-coded:
- **Green** — below 70%
- **Amber** — 70–90%
- **Red** — above 90% (strategy is near its cap)

A cap of 0 is shown as **Blocked** — no capital can be allocated until the cap is raised.
