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

## Granting a role to a Safe

Use the protocol's AccessManager contract to grant the role to your Safe address on-chain. The dashboard reads this state in real time — once the role is granted, the corresponding action buttons will activate automatically.

## Adding yourself as a Safe owner

1. Open your Safe in the [Safe web app](https://app.safe.global).
2. Go to **Settings → Owners** and add your wallet address.
3. Reach the threshold of existing owners to confirm the change.
4. Once added, the dashboard will recognise you as an owner on the next page load.
