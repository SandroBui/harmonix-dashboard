import { getStrategyPageData } from '../lib/strategy-reader'
import { VAULT_GROUPS } from '../lib/vaults.config'

const config = VAULT_GROUPS.find(v => v.slug === 'hip-3-hausdc-vault')!
const data = await getStrategyPageData(config)
let strategyCount = 0
for (const a of data.assets) {
  strategyCount += a.strategies.length
  console.log(a.symbol, a.strategies.length, 'strategies')
}
console.log('total assets:', data.assets.length, 'total strategies:', strategyCount)
