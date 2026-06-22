export const PROXY_ADMIN_ABI = [
  {
    type: 'function',
    name: 'upgrade',
    inputs: [
      { name: 'proxy', type: 'address' },
      { name: 'implementation', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'upgradeAndCall',
    inputs: [
      { name: 'proxy', type: 'address' },
      { name: 'implementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const
