// One-time protocol setup on devnet: initialize config with the deployer as
// oracle authority and treasury. Usage: pnpm --filter @quest/sdk init-devnet
import { readFileSync } from 'node:fs'
import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { fetchConfig, initializeIx, questProgram } from '../src'

const keyPath = new URL('../../../contracts/.keys/deployer.json', import.meta.url)
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))))
const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed')
const program = questProgram(connection)

const existing = await fetchConfig(program)
if (existing) {
  console.log('Already initialized:', {
    authority: existing.authority.toBase58(),
    treasury: existing.treasury.toBase58(),
    feeBps: existing.feeBasisPoints,
    questCount: existing.questCount.toString(),
  })
} else {
  const ix = await initializeIx(program, {
    authority: deployer.publicKey,
    treasury: deployer.publicKey,
    feeBps: 250,
    burnBps: 0,
  })
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [deployer])
  console.log('Initialized:', sig)
}
