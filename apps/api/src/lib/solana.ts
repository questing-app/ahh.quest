import { Connection, Keypair, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { questProgram, type QuestProgram } from '@quest/sdk'
import type { Env } from '../types'

export function getConnection(env: Env): Connection {
  return new Connection(env.SOLANA_RPC_URL, 'confirmed')
}

export function getProgram(env: Env): QuestProgram {
  return questProgram(getConnection(env))
}

export function getOracleKeypair(env: Env): Keypair {
  if (!env.ORACLE_KEYPAIR) throw new Error('ORACLE_KEYPAIR is not set')
  const bytes = Uint8Array.from(atob(env.ORACLE_KEYPAIR), (c) => c.charCodeAt(0))
  return Keypair.fromSecretKey(bytes)
}

// Workers can't hold the websocket web3.js uses for confirmations, so poll.
export async function sendAndConfirm(
  connection: Connection,
  signer: Keypair,
  instructions: TransactionInstruction[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight })
  tx.add(...instructions)
  tx.sign(signer)
  const signature = await connection.sendRawTransaction(tx.serialize())

  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature])
    const status = value[0]
    if (status?.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return signature
    }
    if ((await connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
      throw new Error(`Transaction ${signature} expired before confirming`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}
