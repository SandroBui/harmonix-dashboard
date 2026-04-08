# Environment Variables

Create a `.env` file at the project root with the following variables.

## Required

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SAFE_API_KEY` | JWT API key from [Safe Developer Portal](https://developer.safe.global). Required to call the Safe Transaction Service. |
| `NEXT_PUBLIC_SAFE_ADDRESS` | Fallback Safe address used when no role-specific Safe is configured. |

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
```
