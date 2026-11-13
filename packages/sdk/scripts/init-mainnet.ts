// One-time protocol setup on mainnet, run right after `anchor deploy`.
// The deployer (the program's upgrade authority) signs; the oracle only needs
// its public key here.
//
//   SOLANA_RPC_URL=https://... \
//   ORACLE_PUBKEY=<oracle public key> \
//   TREASURY=<treasury wallet> \
//   FEE_BPS=250 BURN_BPS=5000 \
//   pnpm --filter @quest/sdk init-mainnet            # dry run: prints the plan
//   CONFIRM=yes pnpm --filter @quest/sdk init-mainnet  # sends it
import { readFileSync } from 'node:fs'
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { fetchConfig, initializeIx, programDataAddress, questProgram, PROGRAM_ID } from '../src'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const rpc = required('SOLANA_RPC_URL')
if (rpc.includes('devnet')) throw new Error('SOLANA_RPC_URL points at devnet; use init-devnet for that')
const oracle = new PublicKey(required('ORACLE_PUBKEY'))
const treasury = new PublicKey(required('TREASURY'))
const feeBps = Number(process.env.FEE_BPS ?? 250)
const burnBps = Number(process.env.BURN_BPS ?? 5000)

const keyPath = process.env.DEPLOYER_KEYPAIR ?? new URL('../../../contracts/.keys/deployer.json', import.meta.url).pathname
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8'))))
const connection = new Connection(rpc, 'confirmed')
const program = questProgram(connection)

const genesis = await connection.getGenesisHash()
if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') {
  throw new Error(`RPC is not mainnet-beta (genesis ${genesis})`)
}

const programData = await connection.getAccountInfo(programDataAddress())
if (!programData) throw new Error(`Program ${PROGRAM_ID.toBase58()} is not deployed on this network yet`)
// ProgramData layout: u32 tag, u64 slot, Option<Pubkey> upgrade authority.
const upgradeAuthority = programData.data[12] === 1 ? new PublicKey(programData.data.subarray(13, 45)) : null
if (!upgradeAuthority?.equals(deployer.publicKey)) {
  throw new Error(`Upgrade authority is ${upgradeAuthority?.toBase58() ?? 'none'}, not the deployer ${deployer.publicKey.toBase58()}`)
}

const existing = await fetchConfig(program)
if (existing) {
  console.log('Already initialized:', {
    authority: existing.authority.toBase58(),
    treasury: existing.treasury.toBase58(),
    feeBps: existing.feeBasisPoints,
    burnBps: existing.burnBasisPoints,
    questCount: existing.questCount.toString(),
  })
  process.exit(0)
}

console.log('Initialize mainnet config:', {
  program: PROGRAM_ID.toBase58(),
  admin: deployer.publicKey.toBase58(),
  oracle: oracle.toBase58(),
  treasury: treasury.toBase58(),
  feeBps,
  burnBps,
})
if (process.env.CONFIRM !== 'yes') {
  console.log('Dry run. Re-run with CONFIRM=yes to send.')
  process.exit(0)
}

const ix = await initializeIx(program, { admin: deployer.publicKey, authority: oracle, treasury, feeBps, burnBps })
const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [deployer])
console.log('Initialized:', sig)
