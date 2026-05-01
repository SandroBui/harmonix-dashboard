const PENDING_OPERATION_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'target', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'payload', type: 'bytes' },
    { name: 'predecessor', type: 'bytes32' },
    { name: 'salt', type: 'bytes32' },
    { name: 'proposer', type: 'address' },
    { name: 'scheduledAt', type: 'uint64' },
    { name: 'delay', type: 'uint64' },
  ],
} as const

export const HA_TIMELOCK_CONTROLLER_ABI = [
  // ─── Role constants ───────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'TIMELOCK_PROPOSER_ROLE',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'UPGRADE_EXECUTOR_ROLE',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'SENTINEL_ROLE',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },

  // ─── View ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'getMinDelay',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTimestamp',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOperationState',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOperation',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOperationPending',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOperationReady',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOperationDone',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hashOperation',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'pure',
  },

  // ─── Pending-operations enumeration (IHaTimelockController) ───────────────
  {
    type: 'function',
    name: 'pendingCount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPendingIdAt',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllPendingIds',
    inputs: [],
    outputs: [{ type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPendingOperation',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [PENDING_OPERATION_TUPLE],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllPendingOperations',
    inputs: [],
    outputs: [
      { name: 'ids', type: 'bytes32[]' },
      { name: 'operations', type: 'tuple[]', components: PENDING_OPERATION_TUPLE.components },
    ],
    stateMutability: 'view',
  },

  // ─── Write ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'schedule',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
      { name: 'delay', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'payload', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'cancel',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // ─── Errors ───────────────────────────────────────────────────────────────
  {
    type: 'error',
    name: 'TimelockIndexOutOfBounds',
    inputs: [
      { name: 'index', type: 'uint256' },
      { name: 'length', type: 'uint256' },
    ],
  },

  // ─── Events ───────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'CallScheduled',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'index', type: 'uint256', indexed: true },
      { name: 'target', type: 'address', indexed: false },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'data', type: 'bytes', indexed: false },
      { name: 'predecessor', type: 'bytes32', indexed: false },
      { name: 'delay', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CallExecuted',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'index', type: 'uint256', indexed: true },
      { name: 'target', type: 'address', indexed: false },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'data', type: 'bytes', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CallSalt',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'salt', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Cancelled',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MinDelayChange',
    inputs: [
      { name: 'oldDuration', type: 'uint256', indexed: false },
      { name: 'newDuration', type: 'uint256', indexed: false },
    ],
  },
] as const
