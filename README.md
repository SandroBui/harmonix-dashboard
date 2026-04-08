# Harmonix Dashboard

Internal admin dashboard for the Harmonix protocol on **HyperEVM** (chain 999). All write operations are submitted as **Safe multisig proposals** — no action is executed on-chain until the required number of Safe owners sign and execute the transaction.

## What it does

| Feature | Role required | Description |
|---|---|---|
| NAV Management | Price Updater, Admin | Sync per-category NAV values, trigger PPS recomputation, manage NAV categories |
| Withdrawals | Operator | Review, batch-fulfill, or cancel pending user withdrawal requests |
| Strategies | Curator | Whitelist strategies, set caps, allocate/deallocate capital |
| Safe Transactions | Any owner | View, sign, execute, or cancel pending multisig transactions across all role Safes |

## Quick start

```bash
cp .env.example .env   # fill in your values
yarn install
yarn dev               # http://localhost:3000
```

## Docs

- [Environment variables](docs/env-vars.md)
- [Role & Safe wallet setup](docs/roles-and-safes.md)
- [NAV management guide](docs/nav-management.md)
- [Withdrawals guide](docs/withdrawals.md)
- [Strategies guide](docs/strategies.md)
- [Safe transactions guide](docs/safe-transactions.md)

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **wagmi v2** + **viem** — wallet connection & on-chain reads
- **Safe Protocol Kit + API Kit** — multisig transaction lifecycle
- **TanStack Query** — server-state caching

## Commands

```bash
yarn dev      # dev server (Turbopack)
yarn build    # production build
yarn start    # production server
yarn lint     # ESLint
```
