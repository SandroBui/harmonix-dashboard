import {
  decodeFunctionResult,
  encodeFunctionData,
  type Abi,
  type PublicClient,
} from 'viem'

const VAULT_SETTING_COMPONENTS_BASE = [
  { type: 'uint256', name: 'minimumSupply' },
  { type: 'uint256', name: 'capacity' },
  { type: 'uint256', name: 'performanceFeeRate' },
  { type: 'uint256', name: 'managementFeeRate' },
  { type: 'address', name: 'managementFeeReceiver' },
  { type: 'address', name: 'performanceFeeReceiver' },
  { type: 'uint256', name: 'networkCost' },
] as const

const VAULT_SETTING_COMPONENTS_EXTENDED = [
  ...VAULT_SETTING_COMPONENTS_BASE,
  { type: 'uint256', name: 'ppsDeviationBps' },
  { type: 'uint256', name: 'maxNavStaleness' },
] as const

const GET_VAULT_SETTING_ABI_BASE = [
  {
    type: 'function',
    name: 'getVaultSetting',
    inputs: [{ type: 'address', name: '_vault' }],
    outputs: [
      {
        type: 'tuple',
        components: [...VAULT_SETTING_COMPONENTS_BASE],
      },
    ],
    stateMutability: 'view',
  },
] as const satisfies Abi

const GET_VAULT_SETTING_ABI_EXTENDED = [
  {
    type: 'function',
    name: 'getVaultSetting',
    inputs: [{ type: 'address', name: '_vault' }],
    outputs: [
      {
        type: 'tuple',
        components: [...VAULT_SETTING_COMPONENTS_EXTENDED],
      },
    ],
    stateMutability: 'view',
  },
] as const satisfies Abi

/** Bytes returned for a 7-field VaultSetting tuple (legacy reader). */
const LEGACY_VAULT_SETTING_BYTES = 7 * 32

export type VaultSettingV2Read = {
  minimumSupply: bigint
  capacity: bigint
  performanceFeeRate: bigint
  managementFeeRate: bigint
  managementFeeReceiver: `0x${string}`
  performanceFeeReceiver: `0x${string}`
  networkCost: bigint
  ppsDeviationBps: bigint
  maxNavStaleness: bigint
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export const EMPTY_VAULT_SETTING_V2: VaultSettingV2Read = {
  minimumSupply: 0n,
  capacity: 0n,
  performanceFeeRate: 0n,
  managementFeeRate: 0n,
  managementFeeReceiver: ZERO_ADDRESS,
  performanceFeeReceiver: ZERO_ADDRESS,
  networkCost: 0n,
  ppsDeviationBps: 0n,
  maxNavStaleness: 0n,
}

function decodeVaultSetting(
  data: `0x${string}`,
  extended: boolean,
): VaultSettingV2Read {
  const abi = extended ? GET_VAULT_SETTING_ABI_EXTENDED : GET_VAULT_SETTING_ABI_BASE
  const decoded = decodeFunctionResult({
    abi,
    functionName: 'getVaultSetting',
    data,
  }) as Omit<VaultSettingV2Read, 'ppsDeviationBps' | 'maxNavStaleness'> & {
    ppsDeviationBps?: bigint
    maxNavStaleness?: bigint
  }

  return {
    minimumSupply: decoded.minimumSupply,
    capacity: decoded.capacity,
    performanceFeeRate: decoded.performanceFeeRate,
    managementFeeRate: decoded.managementFeeRate,
    managementFeeReceiver: decoded.managementFeeReceiver,
    performanceFeeReceiver: decoded.performanceFeeReceiver,
    networkCost: decoded.networkCost,
    ppsDeviationBps: decoded.ppsDeviationBps ?? 0n,
    maxNavStaleness: decoded.maxNavStaleness ?? 0n,
  }
}

/**
 * Reads VaultSetting from HaVaultReader v2, decoding 7- or 9-field tuples depending
 * on returndata size (backward compatible with pre-upgrade readers).
 */
export async function readVaultSettingV2(
  publicClient: PublicClient,
  readerAddress: `0x${string}`,
  fundContractAddress: `0x${string}`,
): Promise<VaultSettingV2Read> {
  const callData = encodeFunctionData({
    abi: GET_VAULT_SETTING_ABI_BASE,
    functionName: 'getVaultSetting',
    args: [fundContractAddress],
  })

  try {
    const { data } = await publicClient.call({
      to: readerAddress,
      data: callData,
    })

    if (!data || data === '0x') return EMPTY_VAULT_SETTING_V2

    const byteLength = (data.length - 2) / 2
    const extended = byteLength >= LEGACY_VAULT_SETTING_BYTES + 64
    return decodeVaultSetting(data, extended)
  } catch {
    return EMPTY_VAULT_SETTING_V2
  }
}
