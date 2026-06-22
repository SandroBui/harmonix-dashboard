import { decodeFunctionData } from 'viem'
import { FUND_CONTRACT_ABI, BALANCE_CONTRACT_ABI } from '../lib/contracts'
import { fetchFundAddressTxs } from '../lib/hyperevmscan'
import { getFundContractAddress, getBalanceContractAddress } from '../lib/nav-contract-targets'
import { VAULT_GROUPS } from '../lib/vaults.config'

async function main() {
  const config = VAULT_GROUPS.find((v) => v.slug === 'hype-hahype-vault')!
  const fund = getFundContractAddress(config)
  const balance = getBalanceContractAddress(config)

  const balanceTxs = await fetchFundAddressTxs(balance, { useCache: false, maxPages: 10 })

  for (const tx of balanceTxs) {
    if (!tx.input || tx.input.length < 10) continue
    try {
      const d = decodeFunctionData({ abi: BALANCE_CONTRACT_ABI, data: tx.input as `0x${string}` })
      if (d.functionName !== 'executeAction' && d.functionName !== 'executeBatchActions') continue
      console.log('\n===', tx.hash, d.functionName, '===')
      console.log(JSON.stringify(d.args, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
      if (d.functionName === 'executeAction') {
        const args = d.args as readonly [`0x${string}`, bigint, `0x${string}`]
        if (args[0].toLowerCase() === fund.toLowerCase()) {
          try {
            const inner = decodeFunctionData({ abi: FUND_CONTRACT_ABI, data: args[2] })
            console.log('INNER FUND CALL:', inner.functionName, inner.args)
          } catch (e) {
            console.log('inner decode fail', e)
          }
        }
      }
    } catch {
      /* skip */
    }
  }
}

main().catch(console.error)
