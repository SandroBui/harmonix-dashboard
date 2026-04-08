import Safe from '@safe-global/protocol-kit'

/**
 * Initialises the Protocol Kit using the connected wallet's EIP-1193 provider.
 * Must be called from a client component after the wallet is connected.
 *
 * @param provider     - EIP-1193 provider obtained from wagmi's useConnectorClient
 * @param signer       - The connected wallet address (used as the signer)
 * @param safeAddress  - The Safe multisig address to operate on
 */
export async function initProtocolKit(
  provider: unknown,
  signer: string,
  safeAddress: `0x${string}`,
): Promise<Safe> {
  return Safe.init({
    provider: provider as Parameters<typeof Safe.init>[0]['provider'],
    signer,
    safeAddress,
  })
}
