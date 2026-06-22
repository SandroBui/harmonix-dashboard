import { encodeAbiParameters, keccak256 } from 'viem'

/** keccak256(abi.encode("ROLE")) — v2 contract role identifiers */
export const V2_ENCODED_ROLE_HASHES = {
  ADMIN: keccak256(encodeAbiParameters([{ type: 'string' }], ['ADMIN'])),
  OPERATOR: keccak256(encodeAbiParameters([{ type: 'string' }], ['OPERATOR'])),
  UPGRADER: keccak256(encodeAbiParameters([{ type: 'string' }], ['UPGRADER'])),
} as const

export type V2EncodedRoleKey = keyof typeof V2_ENCODED_ROLE_HASHES

export const V2_ENCODED_ROLE_LABELS: Record<V2EncodedRoleKey, string> = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  UPGRADER: 'UPGRADER',
}

export type V2RolesContractKey = 'fund' | 'balance' | 'perpNav'

/** Roles available on each v2 contract type */
export const V2_CONTRACT_ROLE_KEYS: Record<V2RolesContractKey, readonly V2EncodedRoleKey[]> = {
  fund: ['ADMIN', 'UPGRADER'],
  balance: ['ADMIN', 'OPERATOR'],
  perpNav: ['ADMIN'],
}

export function roleKeysForContract(contractKey: V2RolesContractKey): readonly V2EncodedRoleKey[] {
  return V2_CONTRACT_ROLE_KEYS[contractKey]
}
