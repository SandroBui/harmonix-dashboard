export type SafeAddresses = {
  /** Default Safe (fallback for all roles) */
  default: `0x${string}`
  /** Per-role overrides; if absent, falls back to `default` */
  operator?: `0x${string}`
  curator?: `0x${string}`
  admin?: `0x${string}`
  /** Timelock proposer Safe */
  timelockProposer?: `0x${string}`
}

export type AssetMeta = {
  symbol: string
  decimals: number
}

export type VaultGroupConfig = {
  /** URL-safe slug used in ?vault= query param, e.g. "main" */
  slug: string
  /** Human-readable name shown in the vault selector */
  name: string
  /** Optional short description */
  description?: string
  /** Chain ID — currently always 999 (HyperEVM) */
  chainId: number
  /**
   * The HaVaultReader contract address for this vault group.
   * All other contract addresses (fundNavFeed, fundVault, vaultManager, …)
   * are resolved at runtime by calling the appropriate getter on this contract.
   */
  haVaultReaderAddress: `0x${string}`
  /** Known asset token metadata keyed by lowercase address (optional — resolved dynamically at runtime) */
  assetMetadata?: Record<string, AssetMeta>
  /** Safe multisig addresses for this vault group */
  safe: SafeAddresses
  /** Vault version */
  version: number
  /** v2: fund contract for NAV reads and updateNav propose */
  fundContractAddress?: `0x${string}`
  /** v2: underlying asset address for NAV reads */
  underlyingAssetAddress?: `0x${string}`
  /** v2: balance contract for executeAction (token approve, etc.) */
  balanceContractAddress?: `0x${string}`
  /** v2: perp NAV contract for role management */
  perpNavContractAddress?: `0x${string}`
  /** v2: fund admin manager contract for role management */
  fundAdminManagerContractAddress?: `0x${string}`
  /** v2: optional ProxyAdmin for Fund Admin Manager when EIP-1967 admin slot is empty */
  fundAdminManagerProxyAdminAddress?: `0x${string}`
  /** v2: OpenZeppelin TimelockController for upgrades */
  timelockControllerAddress?: `0x${string}`
}
