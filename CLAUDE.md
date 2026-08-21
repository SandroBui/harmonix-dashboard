@AGENTS.md

# Harmonix Dashboard — Agent Guide

Internal admin dashboard for the Harmonix protocol on **HyperEVM** (chain ID `999`).  
All writes go out as **Safe multisig proposals** — nothing executes on-chain until Safe owners sign and execute.

## Tech stack

- **Next.js 16** App Router (Turbopack) — read `node_modules/next/dist/docs/` before using Next APIs
- **React 19** + **TypeScript** + **Tailwind CSS v4**
- **wagmi** + **viem** — wallet + on-chain reads
- **Safe Protocol Kit / API Kit** — multisig propose / sign / execute
- **TanStack Query** — client server-state
- **NextAuth (Google)** — optional gate via `GOOGLE_AUTH=true`; server exchanges `id_token` with `POST /api/v1/admin/auth/google` (`auth.ts` + `proxy.ts`)

Package manager: **yarn**.

## High-level architecture

```
Browser (wagmi wallet)
  → Client components propose Safe txs (Protocol Kit)
  → Safe Transaction Service via /api/safe/[chainId]/[...path] (server proxy; SAFE_API_KEY stays server-side)

Server Components / Route Handlers
  → lib/*-reader.ts (viem publicClient on HyperEVM)
  → HaVaultReader / Fund / Timelock / etc. ABIs in lib/abis/
```

**Config → resolve → read → render → propose** is the default flow:

1. Vault selected via `?vault=<slug>` (`lib/vaults.config.ts`)
2. Server page calls `resolveVaultFromParams` (`lib/resolve-vault.ts`)
3. Version-specific reader loads on-chain data
4. Page picks `*Client` (v3) or `*V2Client` (v2)
5. Writes build calldata and propose through `lib/safe/*`

## Multi-vault & versioning

| Concept | Where |
|---|---|
| Vault registry | `lib/vaults.config.ts` (`VAULT_GROUPS`) |
| Config type | `lib/vault-group-config.ts` |
| Active vault (client) | `VaultProvider` + `useVaultConfig()` (`lib/vault-context.tsx`) |
| Active vault (server) | `resolveVaultFromParams(searchParams)` |
| UI version gate | `app/vault-version-gate.tsx`, `lib/vault-version.ts` |

- **`version: 3`** — current full UI (`SUPPORTED_UI_VERSION = 3`). Contract graph mostly resolved from `haVaultReaderAddress`.
- **`version: 2`** — parallel UI (`*V2Client`, `*-v2-reader.ts`). Extra addresses live on the vault config (`fundContractAddress`, `timelockControllerAddress`, …). Allowed routes are listed in `VaultVersionGate`.
- Unsupported versions render `VaultVersionPlaceholder`.

Preserve `?vault=` when linking (see `NavLinks` / `safeTransactionsHref`).

## App routes

| Route | Purpose |
|---|---|
| `/status` | Overview / capital / history |
| `/vault-config` | Vault parameters |
| `/admin/nav` | NAV sync / harvest / categories |
| `/admin/roles` | Role & Safe assignment views |
| `/strategies` | Strategy whitelist / caps / allocate |
| `/withdrawals` | Queue review / fulfill / cancel / redeem |
| `/safe-transactions` | Pending Safe txs across role Safes |
| `/timelocks` | Timelock submit / revoke (v3; hidden for v2 nav) |
| `/upgrades` | Proxy upgrade schedule / execute |
| `/emergency` | Pause / protective actions |
| `/login` | Google OAuth (when enabled) |

`app/page.tsx` redirects to `/status`.

## `lib/` layout

| Area | Role |
|---|---|
| `lib/abis/` + `lib/contracts.ts` | Contract ABIs |
| `*-reader.ts` / `*-v2-reader.ts` | Server-side on-chain reads (serialize bigints as strings before client boundary) |
| `lib/safe/` | Roles, Protocol Kit, API Kit, decoder, v2 Safe resolution, hooks |
| `lib/hooks/` | Shared client hooks |
| `lib/strategies/` | Strategy adapters |
| `lib/client.ts` / `lib/wagmi-config.ts` | viem public client + HyperEVM wagmi config |
| `lib/format.ts`, `lib/asset-metadata.ts` | Display helpers |

Naming convention: prefer `foo-reader.ts` for reads and `FooClient` / `FooV2Client` for page UIs. Keep v2/v3 paths separate — do not merge them casually.

## Roles & Safe writes

Role hashes and Safe address resolution live in `lib/safe/roles.ts`.

Typical roles: **operator**, **curator**, **admin**, **timelock_proposer**, plus sentinel / upgrade roles.

Pattern for writes:

1. Resolve Safe for the required role (`getSafeAddressForRole` / resolved on-chain Safes for v2).
2. Confirm Safe has the on-chain role and the connected wallet is a Safe owner.
3. Encode calldata with the right ABI.
4. Propose via Safe Protocol Kit (never send a direct EOA write for protocol actions).
5. Owners finish in **Safe Transactions**.

Safe Transaction Service is proxied at `app/api/safe/[chainId]/[...path]/route.ts` so API keys never ship to the client.

## Auth

- Optional Google gate: `GOOGLE_AUTH=true` (`env.example`, `docs/env-vars.md`). Allowlist lives on the backend (`ADMIN_ALLOWED_EMAILS`), not in this app.
- NextAuth exchanges Google `id_token` for a backend JWT via `POST {API_BASE_URL}/api/v1/admin/auth/google`.
- Request gate: `proxy.ts` (Next.js proxy / middleware equivalent in this app).
- Auth API: `app/api/auth/[...nextauth]`; logout cookie purge: `app/api/logout`.

## Conventions for agents

1. **Read Next docs in-repo** before using framework APIs — this is Next 16, not older Next.
2. **Do not invent vault addresses** — add or change vaults only in `lib/vaults.config.ts`.
3. **Branch on `config.version`** the same way existing `app/**/page.tsx` files do.
4. **Server reads, client proposes** — keep heavy RPC in readers / API routes; keep Safe signing in client components.
5. **Serialize for RSC → client** — no raw `bigint` across the boundary.
6. **Preserve existing UI patterns** — Tailwind utility classes, neutral palette, no new design system.
7. **Docs** for product flows: `docs/*.md`. Prefer updating those when behavior changes.
8. Prefer **yarn** scripts: `yarn dev`, `yarn build`, `yarn lint`.

## Key entry files

- `lib/vaults.config.ts` — vault registry
- `lib/vault-group-config.ts` — config shape
- `lib/safe/roles.ts` — roles + Safe routing
- `app/layout.tsx` — shell, nav, wallet, auth
- `app/providers.tsx` — wagmi + React Query
- `proxy.ts` / `auth.ts` — optional Google gate
- `env.example` — env template
