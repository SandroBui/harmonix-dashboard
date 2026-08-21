# Environment Variables

Create a `.env` file at the project root with the following variables.

## Required

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SAFE_API_KEY` | JWT API key from [Safe Developer Portal](https://developer.safe.global). Required to call the Safe Transaction Service. |
| `NEXT_PUBLIC_SAFE_ADDRESS` | Fallback Safe address used when no role-specific Safe is configured. |

## Optional (server)

| Variable | Description |
|---|---|
| `SAFE_API_KEY` | Server-only JWT forwarded by `/api/safe/[chainId]` to the Safe Transaction Service. Optional on HyperEVM's public tx-service. |
| `TRANSACTION_DECODE_API_BASE_URL` | Server-only origin of the Harmonix decode API (no trailing slash). The dashboard POSTs `{ chain_id, from, to, data, value }` to `{base}/api/v1/transactions/decode` via `/api/transactions/decode`. Unset → fall back to the Safe data-decoder, then local ABIs. Local test example: `http://localhost:8001`. |
| `HYPEREVMSCAN_API_KEY` | Etherscan API v2 key (chainId 999 / HyperEVM) for v2 action history. |

## Google auth (optional)

Set `GOOGLE_AUTH=true` to require Google sign-in. NextAuth handles OAuth; the server then exchanges the Google `id_token` with `POST {API_BASE_URL}/api/v1/admin/auth/google`. Email allowlisting is **backend-only** (`ADMIN_ALLOWED_EMAILS` on rock-onyx-api), not in this dashboard.

Google Cloud redirect URI: `{AUTH_URL}/api/auth/callback/google`.

| Variable | Description |
|---|---|
| `GOOGLE_AUTH` | Set to `true` to enable the auth gate in `proxy.ts`. Anything else leaves the dashboard ungated. |
| `AUTH_SECRET` | Encrypts the NextAuth session cookie. Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | Public URL of this app (e.g. `http://localhost:3000`). Required for OAuth callback and CSRF. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. Must match the backend `GOOGLE_CLIENT_ID` (id_token audience). |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `API_BASE_URL` | Server-only origin of rock-onyx-api (no trailing slash). Local test example: `http://localhost:8001`. |

## Role-specific Safe addresses (recommended)

Each role can have its own dedicated Safe wallet. If a role variable is not set, it falls back to `NEXT_PUBLIC_SAFE_ADDRESS`.

| Variable | Role |
|---|---|
| `NEXT_PUBLIC_SAFE_OPERATOR` | Operator Safe — used for withdrawal fulfillment/cancellation |
| `NEXT_PUBLIC_SAFE_CURATOR` | Curator Safe — used for strategy management |
| `NEXT_PUBLIC_SAFE_PRICE_UPDATER` | Price Updater Safe — used for NAV sync |
| `NEXT_PUBLIC_SAFE_ADMIN` | Admin Safe — used for NAV category management |

## Example `.env`

```env
NEXT_PUBLIC_SAFE_API_KEY=your_jwt_key_here

# Single Safe for all roles (simplest setup)
NEXT_PUBLIC_SAFE_ADDRESS=0xYourSafeAddress

# Or separate Safes per role
NEXT_PUBLIC_SAFE_OPERATOR=0xOperatorSafe
NEXT_PUBLIC_SAFE_CURATOR=0xCuratorSafe
NEXT_PUBLIC_SAFE_PRICE_UPDATER=0xPriceUpdaterSafe
NEXT_PUBLIC_SAFE_ADMIN=0xAdminSafe

# Optional — Harmonix decode API origin (local test: http://localhost:8001)
TRANSACTION_DECODE_API_BASE_URL=

# Optional — Google auth via backend API
GOOGLE_AUTH=false
AUTH_SECRET=
AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
API_BASE_URL=http://localhost:8001
```
