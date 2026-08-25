import { createPublicClient, http, keccak256, toHex, getAddress } from 'viem'

const RPC = 'https://rpc.hyperliquid.xyz/evm'
const CONTROLLER = getAddress('0xdD7330a1D432D3CF9b7d9Da07E8103D6Af50F839')
const ZERO = '0x0000000000000000000000000000000000000000'
const EXECUTOR_ROLE = keccak256(toHex('EXECUTOR_ROLE'))
const PROPOSER_ROLE = keccak256(toHex('PROPOSER_ROLE'))

const client = createPublicClient({
  chain: { id: 999, name: 'HyperEVM', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
})

const ABI = [
  { type: 'function', name: 'hasRole', inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getRoleMemberCount', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getRoleMember', inputs: [{ type: 'bytes32' }, { type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
]
const read = (fn, args) => client.readContract({ address: CONTROLLER, abi: ABI, functionName: fn, args })

async function category(addr) {
  const code = await client.getBytecode({ address: addr })
  if (!code || code === '0x') return 'EOA'
  try { await client.readContract({ address: addr, abi: [{ type: 'function', name: 'getOwners', inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' }], functionName: 'getOwners' }); return 'Safe' } catch { return 'Contract' }
}

async function dump(name, hash) {
  const openRole = await read('hasRole', [hash, ZERO])
  console.log(`\n${name}: openRole(address(0))=${openRole}`)
  try {
    const count = await read('getRoleMemberCount', [hash])
    console.log(`  members=${count}`)
    for (let i = 0n; i < count; i++) {
      const m = await read('getRoleMember', [hash, i])
      console.log(`   - ${m} [${await category(getAddress(m))}]`)
    }
  } catch (e) {
    console.log('  (enumeration not supported on this controller)')
  }
}

async function main() {
  console.log('Controller:', CONTROLLER)
  await dump('EXECUTOR_ROLE', EXECUTOR_ROLE)
  await dump('PROPOSER_ROLE', PROPOSER_ROLE)
}
main().catch((e) => { console.error(e); process.exit(1) })
