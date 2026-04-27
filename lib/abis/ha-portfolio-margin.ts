// ABI for the HaPortfolioMargin strategy.
// Operator-facing functions: push, pull, setDescription.
// Includes coreTokenIndex view used to identify the strategy and to drive
// HyperCore wei conversions in the UI.
//
// Inherited timelock surface (submit/revoke/timelockDuration/executableAt)
// lives in HA_BASE_ABI — do not duplicate.

export const HA_PORTFOLIO_MARGIN_ABI = [
  // ── Writes (CURATOR_ROLE) ──────────────────────────────────────────────────
  {
    type: 'function',
    name: 'push',
    inputs: [{ name: 'evmAmount', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pull',
    inputs: [{ name: 'weiAmount', type: 'uint64', internalType: 'uint64' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDescription',
    inputs: [{ name: 'description_', type: 'string', internalType: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Views ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'asset',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'description',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'coreTokenIndex',
    inputs: [],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'spotBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lendingBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const
