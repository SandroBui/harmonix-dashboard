// ABI for timelock functions inherited from HaBaseUpgradeable.
// Both FundVault and VaultManagerAdmin inherit these.

export const HA_BASE_ABI = [
  // ── Write ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'submit',
    inputs: [{ name: 'data', type: 'bytes', internalType: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revoke',
    inputs: [{ name: 'data', type: 'bytes', internalType: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTimelockDuration',
    inputs: [
      { name: 'selector', type: 'bytes4', internalType: 'bytes4' },
      { name: 'duration', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Read ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'timelockDuration',
    inputs: [{ name: '', type: 'bytes4', internalType: 'bytes4' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'executableAt',
    inputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'TimelockSubmit',
    inputs: [
      { name: 'selector', type: 'bytes4', indexed: true, internalType: 'bytes4' },
      { name: 'data', type: 'bytes', indexed: false, internalType: 'bytes' },
      { name: 'executableAt', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'TimelockRevoke',
    inputs: [
      { name: 'sender', type: 'address', indexed: true, internalType: 'address' },
      { name: 'selector', type: 'bytes4', indexed: true, internalType: 'bytes4' },
      { name: 'data', type: 'bytes', indexed: false, internalType: 'bytes' },
    ],
  },
  {
    type: 'event',
    name: 'TimelockAccept',
    inputs: [
      { name: 'selector', type: 'bytes4', indexed: true, internalType: 'bytes4' },
      { name: 'data', type: 'bytes', indexed: false, internalType: 'bytes' },
    ],
  },
  {
    type: 'event',
    name: 'TimelockDurationSet',
    inputs: [
      { name: 'selector', type: 'bytes4', indexed: true, internalType: 'bytes4' },
      { name: 'newDuration', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
] as const

// ABI for VaultManagerAdmin-specific admin functions
export const VAULT_MANAGER_ADMIN_ABI = [
  // ── Timelocked address setters ─────────────────────────────────────────────
  {
    type: 'function',
    name: 'setAccessManager',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setShareToken',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFundVault',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setRequestManager',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPriceFeed',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFundNav',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setNavAggregateModel',
    inputs: [{ name: 'addr', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFeeReceiver',
    inputs: [{ name: 'receiver', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Timelocked uint256 setters ─────────────────────────────────────────────
  {
    type: 'function',
    name: 'setDeviationPps',
    inputs: [{ name: 'value', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMaxNavStaleness',
    inputs: [{ name: 'value', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPerformanceFeeRate',
    inputs: [{ name: 'rate', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setManagementFeeRate',
    inputs: [{ name: 'rate', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Timelocked vault management ────────────────────────────────────────────
  {
    type: 'function',
    name: 'registerVault',
    inputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeVault',
    inputs: [{ name: 'vault', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Emergency: immediate (no timelock) ─────────────────────────────────────
  {
    type: 'function',
    name: 'pauseContract',
    inputs: [{ name: 'haContract', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'disableFunction',
    inputs: [
      { name: 'haContract', type: 'address', internalType: 'address' },
      { name: 'selector', type: 'bytes4', internalType: 'bytes4' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ── Emergency: timelocked (restore operations) ─────────────────────────────
  {
    type: 'function',
    name: 'unpauseContract',
    inputs: [{ name: 'haContract', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'enableFunction',
    inputs: [
      { name: 'haContract', type: 'address', internalType: 'address' },
      { name: 'selector', type: 'bytes4', internalType: 'bytes4' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const
