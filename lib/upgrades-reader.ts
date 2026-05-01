import { decodeAbiParameters, getAddress } from 'viem'
import { getPublicClient } from './client'
import type { VaultGroupConfig } from './vault-group-config'
import { HA_VAULT_READER_ABI, ACCESS_MANAGER_ABI, HA_TIMELOCK_CONTROLLER_ABI } from './contracts'
import { ROLE_HASHES } from './safe/roles'
import { fetchAssetMetadataForAddresses } from './asset-metadata'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// keccak256("upgradeToAndCall(address,bytes)") — used for best-effort decode
const UPGRADE_TO_AND_CALL_SELECTOR = '0x4f1ef286'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AddressCategory = 'EOA' | 'Safe' | 'Contract'

export type DecodedUpgrade = {
  method: 'upgradeToAndCall'
  newImplementation: `0x${string}`
  initData: `0x${string}`
}

export type UpgradeOperation = {
  id: `0x${string}`
  target: `0x${string}`
  value: string
  data: `0x${string}`
  predecessor: `0x${string}`
  salt: `0x${string}`
  proposer: `0x${string}`
  scheduledAt: string
  delay: string
  executableAt: string
  state: 'Waiting' | 'Ready'
  decoded?: DecodedUpgrade
}

export type KnownContract = {
  name: string
  address: `0x${string}`
}

export type UpgradesPageData = {
  controllerAddress: `0x${string}` | null
  minDelay: string
  executorAddress: `0x${string}` | null
  executorType: AddressCategory | null
  operations: UpgradeOperation[]
  knownContracts: KnownContract[]
  fetchedAt: number
}

type RawPendingOperation = {
  target: `0x${string}`
  value: bigint
  payload: `0x${string}`
  predecessor: `0x${string}`
  salt: `0x${string}`
  proposer: `0x${string}`
  scheduledAt: bigint
  delay: bigint
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SAFE_DETECT_ABI = [
  { type: 'function', name: 'getThreshold', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getOwners', inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
] as const

async function detectAddressCategory(address: `0x${string}`): Promise<AddressCategory> {
  const publicClient = getPublicClient()
  const bytecode = await publicClient.getBytecode({ address })
  if (!bytecode || bytecode === '0x') return 'EOA'
  try {
    await Promise.all([
      publicClient.readContract({ address, abi: SAFE_DETECT_ABI, functionName: 'getThreshold' }),
      publicClient.readContract({ address, abi: SAFE_DETECT_ABI, functionName: 'getOwners' }),
    ])
    return 'Safe'
  } catch {
    return 'Contract'
  }
}

function bestEffortDecode(data: `0x${string}`): DecodedUpgrade | undefined {
  if (!data || data.length < 10) return undefined
  if (data.slice(0, 10).toLowerCase() !== UPGRADE_TO_AND_CALL_SELECTOR) return undefined
  try {
    const [newImpl, initData] = decodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      `0x${data.slice(10)}` as `0x${string}`,
    )
    return {
      method: 'upgradeToAndCall',
      newImplementation: getAddress(newImpl as string) as `0x${string}`,
      initData: initData as `0x${string}`,
    }
  } catch {
    return undefined
  }
}

// ─── Address resolution ───────────────────────────────────────────────────────

async function resolveRoleContractAddress(
  accessManagerAddress: `0x${string}`,
  roleHash: `0x${string}`,
): Promise<{ address: `0x${string}`; type: AddressCategory } | null> {
  const publicClient = getPublicClient()

  const count = await publicClient.readContract({
    address: accessManagerAddress,
    abi: ACCESS_MANAGER_ABI,
    functionName: 'getRoleMemberCount',
    args: [roleHash],
  }) as bigint

  for (let i = 0; i < Number(count); i++) {
    const member = await publicClient.readContract({
      address: accessManagerAddress,
      abi: ACCESS_MANAGER_ABI,
      functionName: 'getRoleMember',
      args: [roleHash, BigInt(i)],
    }) as `0x${string}`

    const type = await detectAddressCategory(member)
    if (type !== 'EOA') {
      return { address: getAddress(member) as `0x${string}`, type }
    }
  }

  // No contract found — fall back to first member of any type
  if (Number(count) > 0) {
    const member = await publicClient.readContract({
      address: accessManagerAddress,
      abi: ACCESS_MANAGER_ABI,
      functionName: 'getRoleMember',
      args: [roleHash, 0n],
    }) as `0x${string}`
    const type = await detectAddressCategory(member)
    return { address: getAddress(member) as `0x${string}`, type }
  }

  return null
}

// ─── Known-contract discovery ─────────────────────────────────────────────────

async function fetchKnownContracts(
  haVaultReaderAddress: `0x${string}`,
): Promise<KnownContract[]> {
  const publicClient = getPublicClient()

  const readAddress = (
    fn: 'getFundVault' | 'getShareToken' | 'getRequestManager' | 'getPriceFeed' | 'getAccessManager',
  ) =>
    (publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: fn,
    }) as Promise<`0x${string}`>).catch(() => null)

  const [
    fundVault,
    shareToken,
    requestManager,
    priceFeed,
    accessManager,
    registeredAssets,
  ] = await Promise.all([
    readAddress('getFundVault'),
    readAddress('getShareToken'),
    readAddress('getRequestManager'),
    readAddress('getPriceFeed'),
    readAddress('getAccessManager'),
    publicClient.readContract({
      address: haVaultReaderAddress,
      abi: HA_VAULT_READER_ABI,
      functionName: 'getRegisteredAssets',
    }) as Promise<readonly `0x${string}`[]>,
  ])

  const out: KnownContract[] = [
    { name: 'HaVaultReader', address: getAddress(haVaultReaderAddress) as `0x${string}` },
  ]

  const coreEntries: Array<[string, `0x${string}` | null]> = [
    ['FundVault', fundVault],
    ['ShareToken', shareToken],
    ['RequestManager', requestManager],
    ['PriceFeed', priceFeed],
    ['AccessManager', accessManager],
  ]
  for (const [name, addr] of coreEntries) {
    if (!addr || addr === ZERO_ADDRESS) continue
    out.push({ name, address: getAddress(addr) as `0x${string}` })
  }

  if (registeredAssets.length > 0) {
    const [assetMeta, ...vaultAddrs] = await Promise.all([
      fetchAssetMetadataForAddresses(registeredAssets),
      ...registeredAssets.map((asset) =>
        (publicClient.readContract({
          address: haVaultReaderAddress,
          abi: HA_VAULT_READER_ABI,
          functionName: 'getVaultForAsset',
          args: [asset],
        }) as Promise<`0x${string}`>).catch(() => null),
      ),
    ])

    for (let i = 0; i < registeredAssets.length; i++) {
      const vault = vaultAddrs[i]
      if (!vault || vault === ZERO_ADDRESS) continue
      const symbol = assetMeta[registeredAssets[i].toLowerCase()]?.symbol ?? registeredAssets[i].slice(0, 8)
      out.push({ name: `Asset Vault (${symbol})`, address: getAddress(vault) as `0x${string}` })
    }
  }

  return out
}

// ─── Main reader ──────────────────────────────────────────────────────────────

export async function getUpgradesPageData(config: VaultGroupConfig): Promise<UpgradesPageData> {
  const publicClient = getPublicClient()

  // Step 1: resolve AccessManager
  const accessManagerAddress = await publicClient.readContract({
    address: config.haVaultReaderAddress,
    abi: HA_VAULT_READER_ABI,
    functionName: 'getAccessManager',
  }) as `0x${string}`

  // Step 2: resolve HaTimelockController (first Contract in UPGRADER_ROLE)
  const controllerResult = await resolveRoleContractAddress(
    accessManagerAddress,
    ROLE_HASHES.upgrader,
  )
  const controllerAddress = controllerResult?.type === 'Contract' ? controllerResult.address : null

  // Step 3: resolve executor (first member of UPGRADE_EXECUTOR_ROLE)
  const executorResult = await resolveRoleContractAddress(
    accessManagerAddress,
    ROLE_HASHES.upgrade_executor,
  )

  if (!controllerAddress) {
    const knownContracts = await fetchKnownContracts(config.haVaultReaderAddress).catch(() => [])
    return {
      controllerAddress: null,
      minDelay: '0',
      executorAddress: executorResult?.address ?? null,
      executorType: executorResult?.type ?? null,
      operations: [],
      knownContracts,
      fetchedAt: Date.now(),
    }
  }

  // Step 4: read minDelay, pending operations, latest block, and known contracts in parallel.
  const [minDelayRaw, pendingResult, latestBlock, knownContracts] = await Promise.all([
    publicClient.readContract({
      address: controllerAddress,
      abi: HA_TIMELOCK_CONTROLLER_ABI,
      functionName: 'getMinDelay',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: controllerAddress,
      abi: HA_TIMELOCK_CONTROLLER_ABI,
      functionName: 'getAllPendingOperations',
    }) as Promise<readonly [readonly `0x${string}`[], readonly RawPendingOperation[]]>,
    publicClient.getBlock(),
    fetchKnownContracts(config.haVaultReaderAddress).catch(() => [] as KnownContract[]),
  ])

  const [ids, rawOperations] = pendingResult
  const blockTs = latestBlock.timestamp

  const operations: UpgradeOperation[] = ids.map((id, i) => {
    const raw = rawOperations[i]
    const executableAt = raw.scheduledAt + raw.delay
    const state: UpgradeOperation['state'] = blockTs >= executableAt ? 'Ready' : 'Waiting'

    return {
      id,
      target: getAddress(raw.target) as `0x${string}`,
      value: raw.value.toString(),
      data: raw.payload,
      predecessor: raw.predecessor,
      salt: raw.salt,
      proposer: getAddress(raw.proposer) as `0x${string}`,
      scheduledAt: raw.scheduledAt.toString(),
      delay: raw.delay.toString(),
      executableAt: executableAt.toString(),
      state,
      decoded: bestEffortDecode(raw.payload),
    }
  })

  // Sort: Ready first, then Waiting; within each bucket, most recently scheduled first.
  const STATE_ORDER: Record<UpgradeOperation['state'], number> = { Ready: 0, Waiting: 1 }
  operations.sort((a, b) => {
    const sd = STATE_ORDER[a.state] - STATE_ORDER[b.state]
    if (sd !== 0) return sd
    return Number(BigInt(b.scheduledAt) - BigInt(a.scheduledAt))
  })

  return {
    controllerAddress,
    minDelay: minDelayRaw.toString(),
    executorAddress: executorResult?.address ?? null,
    executorType: executorResult?.type ?? null,
    operations,
    knownContracts,
    fetchedAt: Date.now(),
  }
}
