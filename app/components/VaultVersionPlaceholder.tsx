export default function VaultVersionPlaceholder({ vaultName }: { vaultName?: string }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          {vaultName ? `${vaultName} dashboard` : 'Vault dashboard'}
        </p>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          UI for this vault version is not available yet.
        </p>
      </div>
    </main>
  )
}
