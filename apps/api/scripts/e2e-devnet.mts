// End-to-end test of the API against the real devnet program.
//
// Starts a throwaway `wrangler dev` that trusts a locally generated signing
// key, creates two test users (poster and claimer) with fresh funded wallets,
// and walks every flow: post, claim, proof + AI check, settlement, give up,
// cancel, the crank, and the guard rails. Test rows are deleted afterwards.
//
// Usage: E2E_MEDIA=/path/with/match.mp4,mismatch.mp4,frames-* pnpm --filter @quest/api e2e:devnet

import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { SignJWT, exportSPKI, generateKeyPair } from 'jose'
import { nanoid } from 'nanoid'
import {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction,
  sendAndConfirmTransaction, type TransactionInstruction,
} from '@solana/web3.js'
import { createMintToInstruction } from '@solana/spl-token'
import {
  abandonClaimIx, ata, bytesToHex, cancelQuestIx, claimQuestIx, createQuestIx, ensureAtaIx,
  fetchClaim, fetchConfig, fetchQuest, hexToBytes, questProgram, sha256, submitProofIx, variant,
} from '@quest/sdk'

const PORT = 8788
const API = `http://localhost:${PORT}`
const MEDIA = process.env.E2E_MEDIA ?? ''
const root = new URL('../', import.meta.url).pathname

const vars = Object.fromEntries(
  [...readFileSync(join(root, '.dev.vars'), 'utf8').matchAll(/^([A-Z_]+)=("?)([^\n]*?)\2$/gm)].map((m) => [m[1], m[3]]),
)
const mint = readFileSync(join(root, 'wrangler.toml'), 'utf8').match(/QUEST_MINT = "(\w+)"/)![1]
const keyFile = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
  readFileSync(join(root, `../../contracts/.keys/${name}.json`), 'utf8'))))

const deployer = keyFile('deployer')
const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const program = questProgram(connection)
const db = createClient({ url: vars.TURSO_DATABASE_URL, authToken: vars.TURSO_AUTH_TOKEN })

let failures = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && !ok ? `  ${JSON.stringify(detail)}` : ''}`)
}

const send = (ixs: TransactionInstruction[], signer: Keypair) =>
  sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [signer])
const tokens = async (owner: Keypair) =>
  Number((await connection.getTokenAccountBalance(ata(mint, owner.publicKey)).catch(() => null))?.value.amount ?? 0)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// --- test server -----------------------------------------------------------

const { publicKey, privateKey } = await generateKeyPair('ES256')
const pem = (await exportSPKI(publicKey)).trim().replace(/\n/g, '\\n')

const server = spawn('npx', [
  'wrangler', 'dev', '--port', String(PORT), '--persist-to', '.wrangler/e2e', '--test-scheduled',
  '--var', `PRIVY_VERIFICATION_KEY:${pem}`, '--var', `R2_PUBLIC_URL:${API}/media`,
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

for (let i = 0; i < 60 && !(await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)); i++) await sleep(1000)

// --- users -----------------------------------------------------------------

type User = { id: string; did: string; wallet: Keypair; token: string }
async function makeUser(label: string): Promise<User> {
  const wallet = Keypair.generate()
  const did = `did:privy:e2e-${label}-${nanoid(8)}`
  const id = nanoid()
  await db.execute({
    sql: `insert into users (id, privy_user_id, pubkey, username, quests_completed, quests_posted, active_claims, flags, created_at)
          values (?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    args: [id, did, wallet.publicKey.toBase58(), `e2e-${label}`, Math.floor(Date.now() / 1000)],
  })
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' })
    .setIssuer('privy.io').setAudience(vars.PRIVY_APP_ID).setSubject(did)
    .setIssuedAt().setExpirationTime('2h').sign(privateKey)
  return { id, did, wallet, token }
}

async function api<T = any>(user: User | null, path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers }
  if (user) headers.Authorization = `Bearer ${user.token}`
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  return { status: res.status, data: data as T }
}

const poster = await makeUser('poster')
const claimer = await makeUser('claimer')

await send([
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: poster.wallet.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: claimer.wallet.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
  ensureAtaIx(deployer.publicKey, poster.wallet.publicKey, mint),
  ensureAtaIx(deployer.publicKey, claimer.wallet.publicKey, mint),
  createMintToInstruction(mint, ata(mint, poster.wallet.publicKey), deployer.publicKey, 200_000_000n),
  createMintToInstruction(mint, ata(mint, claimer.wallet.publicKey), deployer.publicKey, 20_000_000n),
], deployer)
console.log(`users ready: poster ${poster.wallet.publicKey.toBase58()}, claimer ${claimer.wallet.publicKey.toBase58()}`)

try {
  // --- auth ------------------------------------------------------------------
  check((await api(poster, '/api/users/me')).status === 200, 'signed token resolves to the user')
  check((await api(null, '/api/users/me')).status === 401, 'missing token is refused')
  check((await api({ ...poster, token: poster.token.slice(0, -4) + 'AAAA' }, '/api/users/me')).status === 401, 'tampered token is refused')

  // --- posting -----------------------------------------------------------------
  async function post(description: string, reward: number) {
    const pre = await api(poster, '/api/quests/check', { json: { description } })
    if (pre.status !== 200) throw new Error(`check failed: ${JSON.stringify(pre.data)}`)
    const onchainId = (await fetchConfig(program))!.questCount.toString()
    const txSignature = await send([await createQuestIx(program, {
      creator: poster.wallet.publicKey, questId: onchainId, mint, rewardAmount: reward, descriptionHash: await sha256(description),
    })], poster.wallet)
    return { onchainId, txSignature }
  }

  const matchText = 'Hold up a piece of paper with the word QUEST written on it and say quest out loud'
  const q1 = await post(matchText, 20_000_000)
  const wrongDescription = await api(poster, '/api/quests', { json: { description: 'something else', onchainId: q1.onchainId, txSignature: q1.txSignature } })
  check(wrongDescription.status === 400, 'quest whose text does not match the on-chain hash is refused', wrongDescription.data)
  const stolen = await api(claimer, '/api/quests', { json: { description: matchText, onchainId: q1.onchainId, txSignature: q1.txSignature } })
  check(stolen.status === 400, 'another user cannot record someone else’s on-chain quest', stolen.data)
  const quest1 = await api(poster, '/api/quests', { json: { description: matchText, ...q1 } })
  check(quest1.status === 201 && quest1.data.rewardAmount === 20_000_000, 'quest recorded from chain state', quest1.data)
  const dup = await api(poster, '/api/quests', { json: { description: matchText, ...q1 } })
  check(dup.status === 400, 'same on-chain quest cannot be recorded twice', dup.data)

  // --- claiming ----------------------------------------------------------------
  async function claim(questRow: any) {
    const pre = await api(claimer, `/api/quests/${questRow.id}/claim/check`, { method: 'POST' })
    if (pre.status !== 200) throw new Error(`claim check failed: ${JSON.stringify(pre.data)}`)
    const txSignature = await send([await claimQuestIx(program, {
      claimer: claimer.wallet.publicKey, questId: questRow.onchainId, mint,
      stakeAmount: Math.ceil(questRow.rewardAmount * 0.05),
    })], claimer.wallet)
    const res = await api(claimer, `/api/quests/${questRow.id}/claim`, { json: { txSignature } })
    if (res.status !== 201) throw new Error(`claim record failed: ${JSON.stringify(res.data)}`)
    return res.data
  }

  check((await api(poster, `/api/quests/${quest1.data.id}/claim/check`, { method: 'POST' })).status === 400, 'poster cannot claim their own quest')
  const unpaid = await api(claimer, `/api/quests/${quest1.data.id}/claim`, { json: { txSignature: 'x' } })
  check(unpaid.status === 400, 'claim without an on-chain claim is refused', unpaid.data)
  const claim1 = await claim(quest1.data)
  check(claim1.status === 'active' && claim1.stakeAmount === 1_000_000, 'claim recorded with on-chain stake and deadline', claim1)
  check((await api(claimer, `/api/quests/${quest1.data.id}/claim/check`, { method: 'POST' })).status === 400, 'same user cannot claim the same quest twice')
  const q1row = (await api(null, `/api/quests/${quest1.data.id}`)).data
  check(q1row.status === 'claimed', 'quest shows as claimed', q1row.status)

  // --- proof -------------------------------------------------------------------
  async function prove(claimRow: any, questRow: any, video: string, framesDir: string) {
    const bytes = readFileSync(join(MEDIA, video))
    const upload = await api(claimer, '/api/media/upload', { body: bytes, headers: { 'Content-Type': 'video/mp4' } })
    if (upload.status !== 200) throw new Error(`upload failed: ${JSON.stringify(upload.data)}`)
    const frames = readdirSync(join(MEDIA, framesDir)).sort()
    for (const [i, f] of frames.entries()) {
      const r = await api(claimer, '/api/media/upload-frame', {
        body: readFileSync(join(MEDIA, framesDir, f)),
        headers: { 'x-claim-id': claimRow.id, 'x-frame-index': String(i) },
      })
      if (r.status !== 200) throw new Error(`frame upload failed: ${JSON.stringify(r.data)}`)
    }
    const videoHash = bytesToHex(await sha256(new Uint8Array(bytes)))

    const early = await api(claimer, `/api/claims/${claimRow.id}/proof`, { json: { videoUrl: upload.data.uploadUrl, videoHash, durationSeconds: 16 } })
    check(early.status === 400, 'proof is refused before submit_proof is signed', early.data)

    await send([await submitProofIx(program, { claimer: claimer.wallet.publicKey, questId: questRow.onchainId, proofHash: hexToBytes(videoHash) })], claimer.wallet)
    const wrong = await api(claimer, `/api/claims/${claimRow.id}/proof`, { json: { videoUrl: upload.data.uploadUrl, videoHash: '0'.repeat(64), durationSeconds: 16 } })
    check(wrong.status === 400, 'proof with a hash that differs from the on-chain one is refused', wrong.data)
    const ok = await api(claimer, `/api/claims/${claimRow.id}/proof`, { json: { videoUrl: upload.data.uploadUrl, videoHash, durationSeconds: 16 } })
    check(ok.status === 201, 'proof accepted', ok.data)
    return upload.data.uploadUrl as string
  }

  const intruder = await api(poster, '/api/media/upload-frame', { body: new Uint8Array([1]), headers: { 'x-claim-id': claim1.id, 'x-frame-index': '0' } })
  check(intruder.status === 403, 'only the claimer can upload frames for a claim', intruder.data)

  const posterBefore = await tokens(poster.wallet)
  const claimerBefore = await tokens(claimer.wallet)
  const videoUrl = await prove(claim1, quest1.data, 'match.mp4', 'frames-match')

  const ranged = await fetch(videoUrl, { headers: { Range: 'bytes=0-99' } })
  check(ranged.status === 206 && (await ranged.arrayBuffer()).byteLength === 100, 'video is served with range support', ranged.status)
  check((await fetch(`${API}/media/frames/${claim1.id}/frame_000.jpg`)).status === 404, 'frames are not publicly served')

  // --- AI decision -------------------------------------------------------------
  async function waitForDecision(questRow: any, claimId: string) {
    for (let i = 0; i < 60; i++) {
      const rows = (await api(poster, `/api/quests/${questRow.id}/claims`)).data as any[]
      const row = rows.find((r) => r.id === claimId)
      if (row?.proof?.aiDecision) {
        check(!/AI analysis failed/.test(row.proof.aiReasoning ?? ''), 'AI model returned a real verdict', row.proof.aiReasoning)
        return row
      }
      await sleep(5000)
    }
    return null
  }

  const decided1 = await waitForDecision(quest1.data, claim1.id)
  check(!!decided1, 'AI check ran on the matching video', serverLog.slice(-1500))
  if (decided1) {
    console.log(`      AI: ${decided1.proof.aiDecision} at ${decided1.proof.aiConfidence}%: ${decided1.proof.aiReasoning}`)
    let row = decided1
    if (row.status === 'submitted') {
      // Uncertain: goes to the poster. Exercise the creator approval path.
      check((await api(claimer, `/api/claims/${claim1.id}/approve`, { method: 'POST' })).status === 403, 'claimer cannot approve their own attempt')
      const approve = await api(poster, `/api/claims/${claim1.id}/approve`, { method: 'POST' })
      check(approve.status === 200, 'poster approves an uncertain attempt; oracle pays out', approve.data)
      row = (await api(poster, `/api/quests/${quest1.data.id}/claims`)).data.find((r: any) => r.id === claim1.id)
    }
    const chainClaim = await fetchClaim(program, quest1.data.onchainId, claimer.wallet.publicKey)
    const chainQuest = await fetchQuest(program, quest1.data.onchainId)
    const status = variant(chainClaim!.status)
    check(row.status === status, `DB claim status (${row.status}) matches chain (${status})`)
    if (status === 'approved') {
      check(variant(chainQuest!.status) === 'completed', 'quest completed on-chain')
      const gained = (await tokens(claimer.wallet)) - claimerBefore
      check(gained === 19_500_000 + 1_000_000, 'claimer received reward minus 2.5% fee plus stake', gained)
    } else if (status === 'rejected') {
      const gained = (await tokens(poster.wallet)) - posterBefore
      check(gained === 20_000_000, 'rejected: reward returned to poster', gained)
    }
  }

  // --- AI reject path ------------------------------------------------------------
  const pushups = 'Do ten push-ups on a sandy beach with the ocean behind you'
  const q2 = await post(pushups, 10_000_000)
  const quest2 = (await api(poster, '/api/quests', { json: { description: pushups, ...q2 } })).data
  const claim2 = await claim(quest2)
  const posterBefore2 = await tokens(poster.wallet)
  await prove(claim2, quest2, 'mismatch.mp4', 'frames-mismatch')
  const decided2 = await waitForDecision(quest2, claim2.id)
  check(!!decided2, 'AI check ran on the mismatched video')
  if (decided2) {
    console.log(`      AI: ${decided2.proof.aiDecision} at ${decided2.proof.aiConfidence}%: ${decided2.proof.aiReasoning}`)
    let row = decided2
    if (row.status === 'submitted') {
      const reject = await api(poster, `/api/claims/${claim2.id}/reject`, { method: 'POST' })
      check(reject.status === 200, 'poster rejects an uncertain attempt', reject.data)
      row = (await api(poster, `/api/quests/${quest2.id}/claims`)).data.find((r: any) => r.id === claim2.id)
    }
    const status = variant((await fetchClaim(program, quest2.onchainId, claimer.wallet.publicKey))!.status)
    check(status === 'rejected' && row.status === 'rejected', `mismatched video rejected on-chain and in DB (${status}/${row.status})`)
    const gained = (await tokens(poster.wallet)) - posterBefore2
    check(gained >= 10_000_000, 'poster got the reward back', gained)
  }

  // --- give up -------------------------------------------------------------------
  const q3 = await post('Juggle three oranges for thirty seconds without dropping one', 4_000_000)
  const quest3 = (await api(poster, '/api/quests', { json: { description: 'Juggle three oranges for thirty seconds without dropping one', ...q3 } })).data
  const claim3 = await claim(quest3)
  check((await api(claimer, `/api/claims/${claim3.id}`, { method: 'DELETE' })).status === 400, 'give up refused until abandon_claim is signed')

  // --- crank safety: DB must not run ahead of the chain ----------------------------
  await db.execute({ sql: 'update claims set proof_deadline = ? where id = ?', args: [Math.floor(Date.now() / 1000) - 60, claim3.id] })
  await fetch(`${API}/__scheduled?cron=*/5+*+*+*+*`)
  await sleep(8000)
  const afterCrank = (await api(claimer, `/api/quests/${quest3.id}/claims`)).data.find((r: any) => r.id === claim3.id)
  check(afterCrank.status === 'active', 'crank leaves a claim alone when the chain refuses to expire it', afterCrank.status)
  check(/expire_claim failed/.test(serverLog), 'crank logged the refused expire_claim')

  const posterBefore3 = await tokens(poster.wallet)
  await send([await abandonClaimIx(program, { claimer: claimer.wallet.publicKey, creator: poster.wallet.publicKey, questId: quest3.onchainId, mint })], claimer.wallet)
  check((await api(claimer, `/api/claims/${claim3.id}`, { method: 'DELETE' })).status === 204, 'give up recorded after abandon_claim')
  check((await tokens(poster.wallet)) - posterBefore3 === 200_000, 'poster received the forfeited stake')
  const q3row = (await api(null, `/api/quests/${quest3.id}`)).data
  check(q3row.status === 'active' && q3row.currentClaimers === 0, 'quest reopened after give up', q3row)

  // --- cancel --------------------------------------------------------------------
  check((await api(poster, `/api/quests/${quest3.id}`, { method: 'DELETE' })).status === 400, 'cancel refused until cancel_quest is signed')
  const posterBefore4 = await tokens(poster.wallet)
  await send([await cancelQuestIx(program, { creator: poster.wallet.publicKey, questId: quest3.onchainId, mint })], poster.wallet)
  check((await api(poster, `/api/quests/${quest3.id}`, { method: 'DELETE' })).status === 204, 'cancel recorded after cancel_quest')
  check((await tokens(poster.wallet)) - posterBefore4 === 4_000_000, 'poster refunded on cancel')

  // --- profiles --------------------------------------------------------------------
  const me = (await api(claimer, '/api/users/me')).data
  check(me.activeClaims === 0, 'claimer has no active claims left', me)
  const mine = (await api(poster, '/api/feed/mine')).data
  check(mine.quests.length === 3, 'poster sees their three quests', mine.quests.length)
} catch (err) {
  failures++
  console.error('ABORTED', err)
  console.error(serverLog.slice(-3000))
} finally {
  const ids = [poster.id, claimer.id]
  const ph = ids.map(() => '?').join(',')
  await db.batch([
    { sql: `delete from verification_jobs where proof_id in (select p.id from proofs p join claims c on c.id = p.claim_id where c.claimer_id in (${ph}))`, args: ids },
    { sql: `delete from proofs where claim_id in (select id from claims where claimer_id in (${ph}) or quest_id in (select id from quests where creator_id in (${ph})))`, args: [...ids, ...ids] },
    { sql: `delete from claims where claimer_id in (${ph}) or quest_id in (select id from quests where creator_id in (${ph}))`, args: [...ids, ...ids] },
    { sql: `delete from quests where creator_id in (${ph})`, args: ids },
    { sql: `delete from users where id in (${ph})`, args: ids },
  ])
  server.kill()
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}
