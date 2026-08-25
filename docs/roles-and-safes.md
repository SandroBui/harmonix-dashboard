# Roles & Safe Wallet Setup

## Overview

The dashboard enforces on-chain role-based access control via an **AccessManager** contract. Every write action must be proposed through a **Safe multisig** wallet that holds the required role.

## The four roles

| Role | On-chain constant | What it controls |
|---|---|---|
| **Operator** | `keccak256("OPERATOR_ROLE")` | Fulfill and cancel withdrawal requests |
| **Curator** | `keccak256("CURATOR_ROLE")` | Add/remove strategies, set caps, allocate capital |
| **Price Updater** | `keccak256("PRICE_UPDATER_ROLE")` | Sync NAV category values, trigger updateNav |
| **Admin** | `bytes32(0)` (DEFAULT_ADMIN_ROLE) | Add/remove/toggle NAV categories |

## How role checks work

When you connect your wallet, the dashboard:

1. Reads the configured Safe address for the active role.
2. Calls `VaultReader.hasRole(roleHash, safeAddress)` on-chain to confirm the Safe holds the role.
3. Checks if your connected wallet is an **owner** of that Safe.

If both conditions are true, the "Propose via Safe" button becomes active.

## Single Safe vs. separate Safes

**Single Safe (default):** Set only `NEXT_PUBLIC_SAFE_ADDRESS`. All four roles share the same Safe. Simpler to manage but less access separation.

**Separate Safes:** Set `NEXT_PUBLIC_SAFE_OPERATOR`, `NEXT_PUBLIC_SAFE_CURATOR`, `NEXT_PUBLIC_SAFE_PRICE_UPDATER`, and `NEXT_PUBLIC_SAFE_ADMIN` individually. Different teams can operate different roles without sharing a wallet.

## Strategy wallets

Each vault can list the Safe wallets that run its strategies via `safe.strategyWallets` in `lib/vaults.config.ts`:

```ts
safe: {
  default: '0x…',
  strategyWallets: [
    { name: 'Hyperliquid Basis', address: '0x…' },
    // Optional: Safe on another chain (must be listed in lib/networks.ts)
    { name: 'Arbitrum Router', address: '0x…', chainId: 42161 },
  ],
},
```

These are display-only — the **Strategy Wallets** section on `/vault-config` (both v2 and v3) shows the name and address so operators can identify them. They are not role Safes and never appear in the propose flow.

`chainId` on a strategy wallet defaults to the vault's own `chainId`. `/safe-transactions` always queries the Transaction Service for that Safe's chain only, so you never mix queues from two deployments that share an address. Off-vault-chain Safes stay readable but read-only (sign/execute via the Safe app). Network names come from `lib/networks.ts` — the header badge shows the active vault's network via `config.chainId`.

## Granting a role to a Safe

Use the protocol's AccessManager contract to grant the role to your Safe address on-chain. The dashboard reads this state in real time — once the role is granted, the corresponding action buttons will activate automatically.

## Adding yourself as a Safe owner

1. Open your Safe in the [Safe web app](https://app.safe.global).
2. Go to **Settings → Owners** and add your wallet address.
3. Reach the threshold of existing owners to confirm the change.
4. Once added, the dashboard will recognise you as an owner on the next page load.
