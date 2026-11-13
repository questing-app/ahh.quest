import { and, asc, desc, eq, inArray, isNull, like } from 'drizzle-orm'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'
import { createMintToInstruction } from '@solana/spl-token'
import { nanoid } from 'nanoid'
import {
  ata, cancelQuestIx, createQuestIx, ensureAtaIx, fetchConfig, sha256, tokenProgramOf,
} from '@quest/sdk'
import { claims, houseDares, proofs, quests, users } from '../db/schema'
import type { Database } from '../db/client'
import type { Env } from '../types'
import { getConnection, getOracleKeypair, getProgram, sendAndConfirm } from '../lib/solana'
import { createQuest } from './quest.service'
import { isDescriptionAllowed } from './moderation.service'
import { OracleService } from './oracle.service'
import { recordApproved } from './settlement.service'
import { ensureQuestArt, openai } from './quest-art.service'

// House accounts keep a new feed from being empty. They are ordinary accounts
// with their own wallets: they post dares from a queue, pay out the people who
// do them and take down their own stale posts. They never claim a quest and
// never submit a video, so nothing they do can take a reward from a real user.
//
// Devnet only: their SOL and test QUEST come from the oracle, which is the
// test mint's authority. On any other cluster the whole thing is a no-op.

const PREFIX = 'house:'
const MAX_OPEN = 9
/** Until this many are up, post one per run. */
const RAMP = 5
const MIN_GAP = 4 * 3600
const MAX_GAP = 11 * 3600
const STALE_AFTER = 4 * 86400
const MIN_SOL = 0.02 * LAMPORTS_PER_SOL
const SOL_TOP_UP = 0.05 * LAMPORTS_PER_SOL
const QUEST_TOP_UP = 1_000n * 1_000_000n
const REFILL_BELOW = 4

type User = typeof users.$inferSelect
type Dare = typeof houseDares.$inferSelect

export const houseEnabled = (env: Env) =>
  !!env.HOUSE_SEED && env.HOUSE_AGENTS !== 'off' && env.SOLANA_RPC_URL.includes('devnet')

async function keypairFor(env: Env, agent: number): Promise<Keypair> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.HOUSE_SEED}:${agent}`))
  return Keypair.fromSeed(new Uint8Array(digest))
}

const agentOf = (user: User) => Number(user.privyUserId.slice(PREFIX.length))
const now = () => Math.floor(Date.now() / 1000)

/** A stable number in [0, 1) from a string, so timings survive restarts. */
function fraction(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return (h >>> 0) / 2 ** 32
}

async function houseUsers(db: Database): Promise<User[]> {
  return db.select().from(users).where(like(users.privyUserId, `${PREFIX}%`)).all()
}

// ── Setup ──────────────────────────────────────

export interface HouseSeed {
  agents?: { agent: number; username?: string | null }[]
  dares?: { agent: number; text: string; reward: number; limit?: number | null }[]
}

/** Creates the accounts and queues their dares. Safe to run again. */
export async function seedHouse(env: Env, db: Database, seed: HouseSeed) {
  if (!houseEnabled(env)) throw new Error('House accounts are off')
  let accounts = 0
  let renamed = 0
  let queued = 0

  for (const a of seed.agents ?? []) {
    const pubkey = (await keypairFor(env, a.agent)).publicKey.toBase58()
    const privyUserId = `${PREFIX}${a.agent}`
    const existing = await db.select().from(users).where(eq(users.privyUserId, privyUserId)).get()
    if (existing) {
      // A new name for an account that is already there.
      if (a.username && a.username !== existing.username) {
        await db.update(users).set({ username: a.username }).where(eq(users.id, existing.id))
        renamed++
      }
      continue
    }
    await db.insert(users).values({
      id: nanoid(),
      privyUserId,
      pubkey,
      // Same default a new sign-in gets.
      username: a.username || pubkey.slice(0, 8) + '...',
      avatarUrl: null,
      questsCompleted: 0,
      questsPosted: 0,
      activeClaims: 0,
      flags: 0,
      createdAt: now(),
    })
    accounts++
  }

  for (const d of seed.dares ?? []) {
    if (!isDescriptionAllowed(d.text).allowed) continue
    const res = await db.insert(houseDares).values({
      id: nanoid(),
      agent: d.agent,
      description: d.text,
      rewardAmount: Math.round(d.reward * 1_000_000),
      timeLimit: d.limit ?? null,
      usedQuestId: null,
      createdAt: now(),
    }).onConflictDoNothing()
    queued += res.rowsAffected
  }

  return { accounts, renamed, queued }
}

export async function houseUser(db: Database, agent: number) {
  return db.select().from(users).where(eq(users.privyUserId, `${PREFIX}${agent}`)).get()
}

// ── Wallets ────────────────────────────────────

/** Makes sure a house wallet can pay the fee and fund `needed` units of reward. */
async function fund(env: Env, wallet: PublicKey, needed: number) {
  const connection = getConnection(env)
  const oracle = getOracleKeypair(env)
  const mint = new PublicKey(env.QUEST_MINT)
  const tp = await tokenProgramOf(connection, mint)
  const account = ata(mint, wallet, tp)

  const lamports = await connection.getBalance(wallet)
  const held = await connection.getTokenAccountBalance(account)
    .then((b) => BigInt(b.value.amount))
    .catch(() => 0n)
  const short = held < BigInt(needed)
  if (lamports >= MIN_SOL && !short) return

  const topUp = QUEST_TOP_UP > BigInt(needed) ? QUEST_TOP_UP : BigInt(needed)
  await sendAndConfirm(connection, oracle, [
    ...(lamports < MIN_SOL
      ? [SystemProgram.transfer({ fromPubkey: oracle.publicKey, toPubkey: wallet, lamports: SOL_TOP_UP })]
      : []),
    ...(short
      ? [
          ensureAtaIx(oracle.publicKey, wallet, mint, tp),
          createMintToInstruction(mint, account, oracle.publicKey, topUp, [], tp),
        ]
      : []),
  ])
}

// ── Posting ────────────────────────────────────

async function post(env: Env, db: Database, user: User, dare: Dare) {
  const keypair = await keypairFor(env, agentOf(user))
  await fund(env, keypair.publicKey, dare.rewardAmount)

  const program = getProgram(env)
  const config = await fetchConfig(program)
  if (!config) throw new Error('Program config not found')
  const questId = config.questCount.toString()

  // If someone else posts between the read and the send, the id is taken and
  // the transaction fails. The next run just tries again.
  const ix = await createQuestIx(program, {
    creator: keypair.publicKey,
    questId,
    mint: env.QUEST_MINT,
    rewardAmount: dare.rewardAmount,
    target: null,
    timeLimit: dare.timeLimit ? now() + dare.timeLimit : null,
    descriptionHash: await sha256(dare.description),
  })
  const txSignature = await sendAndConfirm(getConnection(env), keypair, [ix])

  const quest = await createQuest(db, env, {
    creatorId: user.id,
    creatorPubkey: user.pubkey,
    description: dare.description,
    onchainId: questId,
    txSignature,
  })
  await db.update(houseDares).set({ usedQuestId: quest.id }).where(eq(houseDares.id, dare.id))
  await ensureQuestArt(env, db, quest)
  return quest
}

/** Takes down a house post nobody picked up, the way people delete old posts. */
async function retire(env: Env, db: Database, user: User, quest: typeof quests.$inferSelect) {
  const keypair = await keypairFor(env, agentOf(user))
  await fund(env, keypair.publicKey, 0)
  const ix = await cancelQuestIx(getProgram(env), {
    creator: keypair.publicKey,
    questId: quest.onchainId,
    mint: quest.rewardMint,
  })
  await sendAndConfirm(getConnection(env), keypair, [ix])
  await db.update(quests).set({ status: 'cancelled', closedAt: now() }).where(eq(quests.id, quest.id))
}

/**
 * Starts the house over: empties the dare queue and takes down every house
 * post nobody has picked up. Posts with a claim on them are left alone.
 */
export async function clearHouse(env: Env, db: Database) {
  if (!houseEnabled(env)) throw new Error('House accounts are off')
  const team = await houseUsers(db)
  const dares = (await db.delete(houseDares)).rowsAffected
  if (!team.length) return { dares, retired: 0, kept: 0 }

  const open = await db.select().from(quests)
    .where(and(inArray(quests.creatorId, team.map((u) => u.id)), inArray(quests.status, ['active', 'claimed'])))
    .all()
  let retired = 0
  for (const quest of open.filter((q) => q.status === 'active')) {
    try {
      await retire(env, db, team.find((u) => u.id === quest.creatorId)!, quest)
      retired++
    } catch (err) {
      console.error(`house retire failed for ${quest.id}:`, err)
    }
  }
  return { dares, retired, kept: open.length - retired }
}

async function postIfDue(env: Env, db: Database, team: User[], force: boolean): Promise<string | null> {
  const ids = team.map((u) => u.id)
  const mine = await db.select().from(quests)
    .where(inArray(quests.creatorId, ids))
    .orderBy(desc(quests.createdAt))
    .all()
  const open = mine.filter((q) => q.status === 'active' || q.status === 'claimed')
  const last = mine[0]

  if (!force && last && mine.length >= RAMP) {
    const gap = MIN_GAP + Math.floor(fraction(last.id) * (MAX_GAP - MIN_GAP))
    if (now() < last.createdAt + gap) return null
  }

  if (open.length >= MAX_OPEN) {
    // Full: make room by retiring the oldest post that is stale or past its deadline.
    const stale = open
      .filter((q) => q.status === 'active')
      .filter((q) => q.createdAt < now() - STALE_AFTER || (q.deadline !== null && q.deadline < now()))
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!stale) return null
    await retire(env, db, team.find((u) => u.id === stale.creatorId)!, stale)
  }

  const waiting = await db.select().from(houseDares).where(isNull(houseDares.usedQuestId)).all()
  // Nobody posts twice in a row.
  const fresh = waiting.filter((d) => houseId(team, d.agent) && houseId(team, d.agent) !== last?.creatorId)
  const pool = fresh.length ? fresh : waiting.filter((d) => houseId(team, d.agent))
  if (!pool.length) return null

  const dare = pool[Math.floor(Math.random() * pool.length)]
  const user = team.find((u) => agentOf(u) === dare.agent)!
  const quest = await post(env, db, user, dare)
  return quest.id
}

const houseId = (team: User[], agent: number) => team.find((u) => agentOf(u) === agent)?.id

// ── Reviewing ──────────────────────────────────

/**
 * A video on a house quest that the automatic check couldn't decide waits for
 * its creator. The house account says yes, after about as long as a person
 * takes to notice. It never rejects: the automatic check already turns away
 * the clear failures, and anything else gets the benefit of the doubt.
 */
async function review(env: Env, db: Database, team: User[]): Promise<number> {
  const ids = team.map((u) => u.id)
  const waiting = await db.select({ claim: claims, quest: quests })
    .from(claims)
    .innerJoin(quests, eq(claims.questId, quests.id))
    .where(and(eq(claims.status, 'submitted'), inArray(quests.creatorId, ids)))
    .all()

  let approved = 0
  for (const { claim, quest } of waiting) {
    const proof = await db.select().from(proofs)
      .where(eq(proofs.claimId, claim.id)).orderBy(desc(proofs.createdAt)).get()
    // No verdict yet means the automatic check is still running.
    if (!proof?.aiDecision) continue
    const wait = (10 + Math.floor(fraction(claim.id) * 50)) * 60
    if (now() < proof.createdAt + wait) continue
    try {
      const txSig = await new OracleService(env, db).approve(quest, claim)
      await recordApproved(db, env, quest, claim, 'creator', txSig)
      approved++
    } catch (err) {
      console.error(`house review failed for ${claim.id}:`, err)
    }
  }
  return approved
}

// ── Writing new dares ──────────────────────────

const WRITER_PROMPT = `You write dares for one person's account on Quest, an app where people post a dare with a reward and someone else films themselves doing it.

You are given dares this person has posted before. Write new ones that sound like the same person: same length, same punctuation and capitalisation habits, same bluntness. Do not repeat or lightly reword any dare in the "already used" list.

These are stunt-show dares: the kind of thing a group of friends dares each other to do at 2am and somebody actually does for the money. Walk around all day on all fours like a dog. Eat the world's hottest pepper. Hitchhike with a stripper. Wheelie past a cop on a kid's bike. Buzz your head. Do the grocery shop in a wedding dress. Sit in a bathtub of baked beans. The fun is that it is a real commitment: public humiliation, a full day of it, real discomfort, or a haircut you have to live with.

How it reads:
- An order, the way this person texts. Say the stunt, then the condition that makes it count (how long, in public, one take, no bailing), and stop.
- Short and flat. No set-up, no explaining why it is funny, no puns, no wordplay.
- Go bigger than feels polite. Never cute, never wholesome, never a craft project, never "pretend to" or "act like" for ten seconds.
- No crypto or trading talk. At most one dare in ten may carry a throwaway line like "it's so over".

Every dare must be:
- Doable by one person, or with a friend who is in on it, with things found at home or in a normal town.
- Survivable and legal. Pain, cold, spice, shame and bad hair are fine. Nothing that can put someone in hospital or in handcuffs: no eating challenges that choke or poison (cinnamon, milk gallons, speed eating, anything that is not food), no fire, heights, traffic, cars or motorbikes, jumping off things, fighting, weapons, alcohol or drugs, tattoos or piercings, trespassing, nothing sexual, political or religious.
- At the expense of the person doing it. Strangers, staff and police can watch, be asked something harmless or choose to join in, but are never tricked, insulted, touched, pranked or filmed as the target. No real named people.
- Not about money: nothing to buy, sell, trade, bet, send, borrow or show a balance, and no real brand, coin or influencer named.
- Under 140 characters. No hashtags, no emoji.

Rewards are uneven: 50-200 for a quick one, 250-900 for a full day or real nerve, 1000-2500 only for something that lasts (hair, eyebrow) or truly hurts, and at most one of those per batch.

Reply with JSON: {"dares": [{"text": "...", "reward": <whole number 50-2500>, "days": <3, 7 or null>}]}`

/** Tops the queue up in the voice of the accounts that are running low. Needs OpenAI. */
async function writeDares(env: Env, db: Database, team: User[]): Promise<number> {
  if (!env.OPENAI_API_KEY) return 0
  const all = await db.select().from(houseDares).orderBy(asc(houseDares.createdAt)).all()
  if (all.filter((d) => !d.usedQuestId).length >= REFILL_BELOW) return 0

  // Whoever has the fewest lines waiting writes next.
  const agents = team.map(agentOf)
    .map((agent) => ({ agent, left: all.filter((d) => d.agent === agent && !d.usedQuestId).length }))
    .sort((a, b) => a.left - b.left || Math.random() - 0.5)
  const agent = agents[0]?.agent
  if (agent === undefined) return 0
  const voice = all.filter((d) => d.agent === agent).slice(-8).map((d) => d.description)
  if (!voice.length) return 0

  const res = await openai(env, '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 1,
      messages: [
        { role: 'system', content: WRITER_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            their_dares: voice,
            already_used: all.slice(-60).map((d) => d.description),
            write: 3,
          }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    }),
  })
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  const drafts = (JSON.parse(data.choices[0].message.content) as { dares?: unknown }).dares
  if (!Array.isArray(drafts)) return 0

  const texts = drafts
    .map((d) => d as { text?: unknown; reward?: unknown; days?: unknown })
    .filter((d): d is { text: string; reward: number; days: unknown } =>
      typeof d.text === 'string' && typeof d.reward === 'number'
      && d.text.length <= 140 && isDescriptionAllowed(d.text.trim()).allowed)
  if (!texts.length) return 0

  // Second opinion from the moderation model: anything it flags is dropped.
  const mod = await openai(env, '/moderations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: texts.map((d) => d.text) }),
  })
  const flags = ((await mod.json()) as { results: { flagged: boolean }[] }).results

  let added = 0
  for (const [i, d] of texts.entries()) {
    if (flags[i]?.flagged) continue
    const res = await db.insert(houseDares).values({
      id: nanoid(),
      agent,
      description: d.text.trim(),
      rewardAmount: Math.min(2500, Math.max(25, Math.round(d.reward))) * 1_000_000,
      timeLimit: d.days === 3 || d.days === 7 ? d.days * 86400 : null,
      usedQuestId: null,
      createdAt: now(),
    }).onConflictDoNothing()
    added += res.rowsAffected
  }
  return added
}

// ── Run ────────────────────────────────────────

/** One pass, called from the crank. Each part fails on its own. */
export async function runHouse(env: Env, db: Database, opts: { force?: boolean } = {}) {
  if (!houseEnabled(env)) return { enabled: false }
  const team = await houseUsers(db)
  if (!team.length) return { enabled: true, accounts: 0 }

  const result = { enabled: true, accounts: team.length, approved: 0, posted: null as string | null, written: 0 }
  try {
    result.approved = await review(env, db, team)
  } catch (err) {
    console.error('house review pass failed:', err)
  }
  try {
    result.posted = await postIfDue(env, db, team, !!opts.force)
  } catch (err) {
    console.error('house post failed:', err)
  }
  try {
    result.written = await writeDares(env, db, team)
  } catch (err) {
    console.error('house dare writer failed:', err)
  }
  return result
}
