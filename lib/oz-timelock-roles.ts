import { keccak256, toHex } from 'viem'

export const OZ_PROPOSER_ROLE = keccak256(toHex('PROPOSER_ROLE'))
export const OZ_EXECUTOR_ROLE = keccak256(toHex('EXECUTOR_ROLE'))

/** OZ TimelockController marks completed operations with timestamp = 1 */
export const OZ_DONE_TIMESTAMP = 1n
