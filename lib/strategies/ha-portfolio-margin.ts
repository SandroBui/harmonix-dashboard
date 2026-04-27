import { HA_PORTFOLIO_MARGIN_ABI } from '@/lib/abis'
import type { StrategyAdapter } from './adapters'

// The deployment convention is "HaPortfolioMargin - <ASSET>" (e.g. "HaPortfolioMargin - USDC").
// We match by prefix so minor asset-name variations still resolve correctly.
// A secondary ABI probe (calling coreTokenIndex()) happens in the UI before rendering
// operations to guard against description spoofing.

const SUPPLY_ASYNC_WARNING =
  'Two CoreWriter actions are queued and executed in a later HyperCore block. Input 0 if we want to supply all.'

const WITHDRAW_ASYNC_WARNING =
  'Two CoreWriter actions are queued and executed in a later HyperCore block. Input 0 if we want to withdraw all.'

export const haPortfolioMarginAdapter: StrategyAdapter = {
  type: 'HaPortfolioMargin',

  matches: (description: string) => description.startsWith('HaPortfolioMargin'),

  abi: HA_PORTFOLIO_MARGIN_ABI as never,

  operations: [
    {
      functionName: 'push',
      label: 'Push (Bridge & Supply)',
      blurb:
        'Bridge EVM tokens to HyperCore spot then supply into the Portfolio Margin lending market.',
      role: 'curator',
      inputs: [
        {
          name: 'evmAmount',
          solidityType: 'uint256',
          label: 'Amount',
          kind: 'evm-decimals',
          placeholder: '0.0',
          helperText: 'Amount of asset to bridge from HyperEVM to HyperCore.',
          zeroMeaning:
            'Pass 0 to supply the current HyperCore spot balance only (skips the bridge step).',
        },
      ],
      warning: SUPPLY_ASYNC_WARNING,
    },
    {
      functionName: 'pull',
      label: 'Pull (Withdraw & Bridge)',
      blurb:
        'Withdraw from the Portfolio Margin lending market then bridge the asset back to HyperEVM.',
      role: 'curator',
      inputs: [
        {
          name: 'weiAmount',
          solidityType: 'uint64',
          label: 'Amount',
          kind: 'core-wei-from-evm',
          placeholder: '0.0',
          helperText:
            'Amount to withdraw from HyperCore PM lending (converted to HyperCore wei automatically).',
          zeroMeaning:
            'Pass 0 to bridge the current HyperCore spot balance back to HyperEVM (skips the lending withdrawal).',
        },
      ],
      warning: WITHDRAW_ASYNC_WARNING,
    },
    {
      functionName: 'setDescription',
      label: 'Set Description',
      blurb: 'Update the human-readable label stored on this strategy contract.',
      role: 'curator',
      inputs: [
        {
          name: 'description_',
          solidityType: 'string',
          label: 'New description',
          kind: 'string',
          placeholder: 'HaPortfolioMargin - USDC',
        },
      ],
    },
  ],
}
