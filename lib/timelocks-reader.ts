import { createPublicClient, http, toFunctionSelector } from 'viem'
import {
  HA_VAULT_READER_ADDRESS,
  HA_VAULT_READER_ABI,
  FUND_NAV_FEED_ADDRESS,
  FUND_NAV_FEED_ABI,
  VAULT_MANAGER_ABI,
  FUND_VAULT_ABI,
  VAULT_MANAGER_ADMIN_ABI,
} from './contracts'
import { hyperEvmMainnet } from './wagmi-config'

const publicClient = createPublicClient({
  chain: hyperEvmMainnet,
  transport: http(),
})

// ─── Known timelocked functions ───────────────────────────────────────────────

export type ContractTarget = 'fundVault' | 'vaultManagerAdmin'

export type TimelockFunctionDef = {
  name: string
  signature: string
  selector: `0x${string}`
  contract: ContractTarget
  abi: readonly object[]
  args: 'address' | 'address_uint256'
}

export const TIMELOCKED_FUNCTIONS: TimelockFunctionDef[] = [
  {
    name: 'addStrategy',
    signature: 'addStrategy(address)',
    selector: toFunctionSelector('addStrategy(address)'),
    contract: 'fundVault',
    abi: FUND_VAULT_ABI,
    args: 'address',
  },
  {
    name: 'removeStrategy',
    signature: 'removeStrategy(address)',
    selector: toFunctionSelector('removeStrategy(address)'),
    contract: 'fundVault',
    abi: FUND_VAULT_ABI,
    args: 'address',
  },
  {
    name: 'setStrategyCap',
    signature: 'setStrategyCap(address,uint256)',
    selector: toFunctionSelector('setStrategyCap(address,uint256)'),
    contract: 'fundVault',
    abi: FUND_VAULT_ABI,
    args: 'address_uint256',
  },
  {
    name: 'setAccessManager',
    signature: 'setAccessManager(address)',
    selector: toFunctionSelector('setAccessManager(address)'),
    contract: 'vaultManagerAdmin',
    abi: VAULT_MANAGER_ADMIN_ABI,
    args: 'address',
  },
  {
    name: 'setShareToken',
    signature: 'setShareToken(address)',
    selector: toFunctionSelector('setShareToken(address)'),
    contract: 'vaultManagerAdmin',
    abi: VAULT_MANAGER_ADMIN_ABI,
    args: 'address',
  },
  {
    name: 'setFundVault',
    signature: 'setFundVault(address)',
    selector: toFunctionSelector('setFundVault(address)'),
    contract: 'vaultManagerAdmin',
    abi: VAULT_MANAGER_ADMIN_ABI,
    args: 'address',
  },
  {
    name: 'setFeeReceiver',
    signature: 'setFeeReceiver(address)',
    selector: toFunctionSelector('setFeeReceiver(address)'),
    contract: 'vaultManagerAdmin',
    abi: VAULT_MANAGER_ADMIN_ABI,
    args: 'address',
  },
]

// ─── Output types (no bigints) ────────────────────────────────────────────────

export type TimelockEntry = {
  fnName: string
  signature: string
  selector: string
  contract: ContractTarget
  contractAddress: string
  duration: string // seconds as string
}

export type PendingOperation = {
  id: string           // keccak256(data) used as stable key
  fnName: string
  selector: string
  data: string         // raw calldata hex
  contract: ContractTarget
  contractAddress: string
  executableAt: string // unix timestamp as string
  isReady: boolean
}

export type TimelockPageData = {
  fundVaultAddress: string
  vaultManagerAdminAddress: string
  timelocks: TimelockEntry[]
  pendingOps: PendingOperation[]
  fetchedAt: number
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function getTimelockPageData(): Promise<TimelockPageData> {
  // ── Step 1: get contract addresses ──────────────────────────────────────────
  const [fundVaultAddress, vaultManagerAddress] = await Promise.all([
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFundVault',
    }) as Promise<`0x${string}`>,
    publicClient.readContract({
      address: FUND_NAV_FEED_ADDRESS,
      abi: FUND_NAV_FEED_ABI,
      functionName: 'vaultManager',
    }) as Promise<`0x${string}`>,
  ])

  // VaultManagerAdmin is a facet of VaultManager
  const vaultManagerAdminAddress = await publicClient.readContract({
    address: vaultManagerAddress,
    abi: VAULT_MANAGER_ABI,
    functionName: 'adminFacet',
  }) as `0x${string}`

  // ── Step 2: read timelock durations via HaVaultReader ─────────────────────
  const fundVaultFns = TIMELOCKED_FUNCTIONS.filter((f) => f.contract === 'fundVault')
  const vaultAdminFns = TIMELOCKED_FUNCTIONS.filter((f) => f.contract === 'vaultManagerAdmin')

  const [fvDurations, vaaDurations] = await Promise.all([
    Promise.all(
      fundVaultFns.map((f) =>
        publicClient.readContract({
          address: HA_VAULT_READER_ADDRESS,
          abi: HA_VAULT_READER_ABI,
          functionName: 'getTimelockDuration',
          args: [fundVaultAddress, f.selector as `0x${string}`],
        }) as Promise<bigint>
      )
    ),
    Promise.all(
      vaultAdminFns.map((f) =>
        publicClient.readContract({
          address: HA_VAULT_READER_ADDRESS,
          abi: HA_VAULT_READER_ABI,
          functionName: 'getTimelockDuration',
          args: [vaultManagerAdminAddress, f.selector as `0x${string}`],
        }) as Promise<bigint>
      )
    ),
  ])

  const timelocks: TimelockEntry[] = [
    ...fundVaultFns.map((f, i) => ({
      fnName: f.name,
      signature: f.signature,
      selector: f.selector,
      contract: f.contract,
      contractAddress: fundVaultAddress.toLowerCase(),
      duration: (fvDurations[i] ?? 0n).toString(),
    })),
    ...vaultAdminFns.map((f, i) => ({
      fnName: f.name,
      signature: f.signature,
      selector: f.selector,
      contract: f.contract,
      contractAddress: vaultManagerAdminAddress.toLowerCase(),
      duration: (vaaDurations[i] ?? 0n).toString(),
    })),
  ]

  // ── Step 3: fetch pending operations via HaVaultReader ────────────────────
  type RawPendingOp = {
    data: `0x${string}`
    selector: `0x${string}`
    executableAt: bigint
    isReady: boolean
  }

  const [fvPending, vaaPending] = await Promise.all([
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getFundVaultPending',
    }) as Promise<readonly RawPendingOp[]>,
    publicClient.readContract({
      address: HA_VAULT_READER_ADDRESS,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getVaultManagerAdminPending',
    }) as Promise<readonly RawPendingOp[]>,
  ])

  function mapPendingOps(
    ops: readonly RawPendingOp[],
    contract: ContractTarget,
    contractAddress: string
  ): PendingOperation[] {
    return ops.map((op, i) => {
      const fnDef = TIMELOCKED_FUNCTIONS.find(
        (f) => f.selector.toLowerCase() === op.selector.toLowerCase()
      )
      return {
        id: `${contractAddress}-${op.selector}-${i}`,
        fnName: fnDef?.name ?? 'unknown',
        selector: op.selector,
        data: op.data,
        contract,
        contractAddress: contractAddress.toLowerCase(),
        executableAt: op.executableAt.toString(),
        isReady: op.isReady,
      }
    })
  }

  const pendingOps: PendingOperation[] = [
    ...mapPendingOps(fvPending, 'fundVault', fundVaultAddress),
    ...mapPendingOps(vaaPending, 'vaultManagerAdmin', vaultManagerAdminAddress),
  ]

  return {
    fundVaultAddress: fundVaultAddress.toLowerCase(),
    vaultManagerAdminAddress: vaultManagerAdminAddress.toLowerCase(),
    timelocks,
    pendingOps,
    fetchedAt: Date.now(),
  }
}
