'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Share } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { groupedList } from '@/components/notice'
import { SkeletonQuest } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { Timeline, questStops } from '@/components/timeline'
import { Sheet } from '@/components/sheet'
import { ConfirmButton } from '@/components/confirm-button'
import { TokenBalance, useTokenBalance } from '@/components/token-balance'
import { Attempts } from '@/components/attempts'
import { button } from '@/components/button'
import { toast } from '@/components/toast'
import { questAvailability } from '@/components/quest-row'
import { MAX_SECONDS, MIN_SECONDS } from '@/lib/proof'
import { stashPickedVideo } from '@/lib/picked-video'
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { useApi, useSession } from '@/lib/session'
import { displayName, type Proof, type Quest, type QuestClaim, type User } from '@/lib/types'
import { feeFor, formatUnits, shortAddress, stakeFor, tokenForMint } from '@/lib/tokens'
import { closesAt, countdown, formatClock, formatDate, remaining, roughLeft, timeAgo } from '@/lib/time'
import { ApiError, errorMessage } from '@/lib/api'
import { CLUSTER, explorerAddress, program, useSendTransaction, useWallet } from '@/lib/chain'
import { useOnline } from '@/lib/network'
import { shareLink } from '@/lib/share'
import { abandonClaimIx, cancelQuestIx, claimQuestIx } from '@quest/sdk'

/** Space under the content for the pinned action and the tab bar. */
const FOOTER_SPACE = 'pb-[calc(49px+env(safe-area-inset-bottom)+132px)]'
/** The same, when the footer stacks three actions. */
const TALL_FOOTER_SPACE = 'pb-[calc(49px+env(safe-area-inset-bottom)+190px)]'

const VIDEO_RULE = `One take, ${MIN_SECONDS}–${MAX_SECONDS} s`

export default function QuestPage() {
  const { id } = useParams<{ id: string }>()
  const quest = useQuest(id)
  const claims = useQuestClaims(id)
  const { data: me } = useMe()
  const params = useSearchParams()
  const router = useRouter()

  if (quest.error) {
    const missing = quest.error instanceof ApiError && quest.error.status === 404
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="Quest" back="Quests" />
        <EmptyState
          art="/art/notfound.jpg"
          title={missing ? 'Quest not found' : 'Couldn’t load this quest'}
          body={
            missing
              ? 'This quest doesn’t exist or was taken down. If it was cancelled, its reward went back to the poster.'
              : errorMessage(quest.error)
          }
        >
          {missing ? (
            <Link href="/" className={`${button()} w-full`}>
              See open quests
            </Link>
          ) : (
            <button type="button" onClick={() => quest.refetch()} className={`${button()} w-full`}>
              Try again
            </button>
          )}
        </EmptyState>
      </div>
    )
  }

  if (!quest.data) {
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="Quest" back="Quests" />
        <SkeletonQuest />
      </div>
    )
  }

  const q = quest.data
  const list = claims.data ?? []
  const isPoster = me?.id === q.creatorId

  if (params.get('posted') === '1' && isPoster) {
    return <PostedView quest={q} onDone={() => router.replace(`/q/${id}`)} />
  }
  if (isPoster) return <PosterView quest={q} claims={list} />

  const mine = (status: QuestClaim['status'][]) =>
    me ? list.find((c) => c.claimerId === me.id && status.includes(c.status)) : undefined

  const active = mine(['active'])
  if (active) return <TakingView quest={q} claims={list} claim={active} />
  const sent = mine(['submitted'])
  if (sent) return <SentView quest={q} claims={list} claim={sent} />
  const rejected = mine(['rejected'])
  if (rejected) return <RejectedView quest={q} claim={rejected} />
  const paid = mine(['approved'])
  if (paid) return <PaidGate quest={q} claims={list} claim={paid} me={me} />

  return <BrowseView quest={q} claims={list} me={me} />
}

// ── Shared pieces ───────────────────────────────────

function money(quest: Quest, units: number): string {
  const token = tokenForMint(quest.rewardMint)
  return `${formatUnits(units, token.decimals)} ${token.symbol}`
}

/** What a taker ends up with: the reward less the 2.5% fee, plus their deposit back. */
function payout(quest: Quest, stake: number): number {
  return quest.rewardAmount - feeFor(quest.rewardAmount) + stake
}

/** Re-renders once a second so countdowns tick. */
function useTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])
}

/** On-chain actions: each is signed first, then the API mirrors what landed. */
function useQuestActions(quest: Quest) {
  const api = useApi()
  const queryClient = useQueryClient()
  const sendTransaction = useSendTransaction()
  const { address } = useWallet()
  const balance = useTokenBalance()
  const stake = stakeFor(quest.rewardAmount)
  const onChain = { questId: quest.onchainId, mint: quest.rewardMint }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quest', quest.id] })
    queryClient.invalidateQueries({ queryKey: ['mine'] })
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    queryClient.invalidateQueries({ queryKey: ['me'] })
    queryClient.invalidateQueries({ queryKey: ['balance'] })
  }

  const [claimStep, setClaimStep] = useState<'checking' | 'funding' | 'signing'>('checking')
  const claim = useMutation({
    mutationFn: async () => {
      setClaimStep('checking')
      await api(`/api/quests/${quest.id}/claim/check`, { method: 'POST' })

      // Testing on devnet: mint whatever test QUEST the deposit is short by.
      const held = balance.data ?? 0
      if (CLUSTER === 'devnet' && stake > held) {
        setClaimStep('funding')
        await api('/api/dev/faucet', { json: { amount: stake - held } })
        await queryClient.invalidateQueries({ queryKey: ['balance'] })
      }

      setClaimStep('signing')
      const ix = await claimQuestIx(program, { ...onChain, claimer: address!, stakeAmount: stake })
      const txSignature = await sendTransaction([ix])
      return api(`/api/quests/${quest.id}/claim`, { json: { txSignature } })
    },
    onSuccess: () => {
      refresh()
      toast('You’re on it. The clock is running.')
    },
  })
  const cancel = useMutation({
    mutationFn: async () => {
      await sendTransaction([await cancelQuestIx(program, { ...onChain, creator: address! })])
      return api(`/api/quests/${quest.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      refresh()
      toast(`Quest cancelled. ${money(quest, quest.rewardAmount)} is back in your wallet.`)
    },
  })
  const abandon = useMutation({
    mutationFn: async (claimId: string) => {
      const creator = quest.creator?.pubkey
      if (!creator) throw new Error('Couldn’t find who posted this quest.')
      await sendTransaction([await abandonClaimIx(program, { ...onChain, claimer: address!, creator })])
      return api(`/api/claims/${claimId}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      refresh()
      toast('You gave up this quest.')
    },
  })

  return { claim, claimStep, cancel, abandon, stake, walletReady: !!address }
}

type PillTone = 'good' | 'warn' | 'plain' | 'bad'

const PILL_TONES: Record<PillTone, string> = {
  good: 'bg-moss-pale text-moss-deep',
  warn: 'bg-[#F3E3C4] text-[#6E4310]',
  plain: 'bg-ink/[0.06] text-ink-soft',
  bad: 'bg-wax/10 text-wax',
}

function Pill({ tone = 'plain', children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${PILL_TONES[tone]}`}>
      {children}
    </span>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="px-4 pt-2 font-display text-[28px] leading-[1.12]">{children}</h1>
}

function RewardCard({ quest }: { quest: Quest }) {
  const token = tokenForMint(quest.rewardMint)
  return (
    <div className="mx-4 mt-4 rounded-[16px] bg-paper-raised p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] uppercase tracking-wide text-ink-soft">Reward</p>
          <p className="mt-1 leading-none">
            <span className="tabular font-display text-[42px] text-moss">{formatUnits(quest.rewardAmount, token.decimals)}</span>{' '}
            <span className="text-lg font-semibold">{token.symbol}</span>
          </p>
        </div>
        {quest.escrowPda && (
          <a
            href={explorerAddress(quest.escrowPda)}
            target="_blank"
            rel="noreferrer"
            className="press mb-1 rounded-full bg-moss-pale px-2.5 py-1 text-[12px] font-semibold text-moss-deep"
          >
            Locked ✓
          </a>
        )}
      </div>
      <p className="tabular mt-3 text-[13px] text-ink-soft">
        Winner gets {money(quest, quest.rewardAmount - feeFor(quest.rewardAmount))} after the 2.5% fee
      </p>
    </div>
  )
}

function TimelineCard({ quest, claims }: { quest: Quest; claims: QuestClaim[] }) {
  return (
    <div className="mx-4 mt-3 rounded-[16px] bg-paper-raised px-3 py-4">
      <Timeline stops={questStops(quest, claims)} />
    </div>
  )
}

function Card({
  title,
  children,
  tone,
  person,
  href,
}: {
  title: string
  children?: React.ReactNode
  tone?: 'act'
  person?: QuestClaim['claimer']
  href?: string
}) {
  const body = (
    <>
      {person !== undefined && <Avatar person={person} size={40} />}
      <div className="min-w-0 flex-1">
        <p className={`text-[17px] font-semibold ${tone === 'act' ? 'text-wax' : ''}`}>{title}</p>
        {children && <div className="mt-1 text-[15px] leading-relaxed text-ink-soft">{children}</div>}
      </div>
      {href && <span className="text-[20px] text-ink/25">›</span>}
    </>
  )
  const className = 'mx-4 mt-3 flex items-center gap-3 rounded-[16px] bg-paper-raised px-5 py-4'
  return href ? (
    <Link href={href} className={`${className} press`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5 text-[17px]">
      <dt className="shrink-0">{label}</dt>
      <dd className="tabular min-w-0 truncate text-right text-ink-soft">{children}</dd>
    </div>
  )
}

/** Primary action pinned just above the tab bar, where the thumb is. */
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="chrome fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 border-t-[0.5px] border-ink/10 bg-paper/95 px-4 pb-3 pt-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[520px] flex-col gap-1.5">{children}</div>
    </div>
  )
}

function ErrorLine({ error }: { error: Error | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-center text-[15px] text-wax">
      {errorMessage(error)}
    </p>
  )
}

/** A sent video as a row; tapping it opens the player in place. */
function VideoRow({ proof, title, sub }: { proof: Proof; title: string; sub: string }) {
  const [open, setOpen] = useState(false)
  if (open) {
    return (
      <video
        src={proof.videoUrl}
        poster={proof.thumbnailUrl ?? undefined}
        controls
        autoPlay
        playsInline
        className="mx-4 mt-3 aspect-[9/16] w-[calc(100%-2rem)] rounded-[16px] bg-night object-cover"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="press mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-[16px] bg-paper-raised p-3 text-left"
    >
      <span className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-night">
        {proof.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- frames come from the storage host
          <img src={proof.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        )}
        <Play className="relative h-4 w-4 fill-paper-raised text-paper-raised" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">{title}</span>
        <span className="tabular block text-[15px] text-ink-soft">{sub}</span>
      </span>
      <span className="pr-1 text-[20px] text-ink/25">›</span>
    </button>
  )
}

function closedLine(quest: Quest): string {
  switch (quest.status) {
    case 'completed':
      return 'Someone did it and was paid.'
    case 'failed':
      return 'The video wasn’t approved, so the reward went back to the poster.'
    case 'cancelled':
      return 'The poster cancelled it and got the reward back.'
    case 'expired':
      return 'Nobody finished it in time, so the reward went back to the poster.'
    default:
      return 'Someone else is on it right now.'
  }
}

function aiVerdict(proof: Proof | null | undefined): string {
  if (!proof || proof.aiDecision == null) return 'Didn’t run'
  const label = proof.aiDecision === 'APPROVE' ? 'Looks done' : proof.aiDecision === 'REJECT' ? 'Looks short' : 'Unsure'
  return proof.aiConfidence == null ? label : `${label}, ${proof.aiConfidence}%`
}

// ── B4 · Someone looking at a quest ─────────────────

function BrowseView({ quest, claims, me }: { quest: Quest; claims: QuestClaim[]; me: User | undefined }) {
  const { ready, authenticated, login } = useSession()
  const { claim, claimStep, stake, walletReady } = useQuestActions(quest)
  const [takeOpen, setTakeOpen] = useState(false)
  const online = useOnline()

  const open = quest.status === 'active'
  const forSomeoneElse = open && quest.questType === 'direct' && !!me && quest.targetPubkey !== me.pubkey
  const paidMe = me ? claims.find((c) => c.claimerId === me.id && c.status === 'approved') : undefined
  const loadingAccount = ready && authenticated && (!me || !walletReady)
  const canTake = ready && open && !forSomeoneElse && !loadingAccount
  const depositNote = `${money(quest, stake)} deposit, returned with the reward`

  return (
    <div className={canTake ? FOOTER_SPACE : TAB_BAR_SPACE}>
      <NavBar
        title=""
        back="Quests"
        right={
          <button
            type="button"
            aria-label="Share this quest"
            onClick={() => shareLink(`${window.location.origin}/q/${quest.id}`, quest.description)}
            className="press -mr-2 flex h-11 w-11 items-center justify-center text-moss"
          >
            <Share className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          </button>
        }
      />
      <main>
        <div className="px-4">
          {quest.creator ? (
            <Link href={`/u/${quest.creator.pubkey}`} className="press flex min-h-[44px] items-center gap-2.5 text-[15px]">
              <Creator quest={quest} />
            </Link>
          ) : (
            <div className="flex min-h-[44px] items-center gap-2.5 text-[15px]">
              <Creator quest={quest} />
            </div>
          )}
        </div>
        <Title>{quest.description}</Title>

        <RewardCard quest={quest} />
        <TimelineCard quest={quest} claims={claims} />

        {paidMe ? (
          <Card title="You did this one">You were paid {money(quest, payout(quest, paidMe.stakeAmount))}.</Card>
        ) : !open ? (
          <Card title="Not taking attempts">{closedLine(quest)}</Card>
        ) : forSomeoneElse ? (
          <Card title="Posted for someone else">Only {shortAddress(quest.targetPubkey!)} can take this one.</Card>
        ) : loadingAccount ? (
          <Card title="Loading your account…" />
        ) : null}

        <dl className={`${groupedList} mt-3`}>
          <Fact label="Who can take it">
            {quest.questType === 'direct' && quest.targetPubkey
              ? quest.targetPubkey === me?.pubkey
                ? 'Only you'
                : `Only ${shortAddress(quest.targetPubkey)}`
              : 'Anyone'}
          </Fact>
          <Fact label={open ? 'Open until' : 'Status'}>
            {!open
              ? questAvailability(quest)
              : !quest.deadline
                ? 'No limit'
                : remaining(quest.deadline)
                  ? closesAt(quest.deadline)
                  : `Ended ${formatDate(quest.deadline)}`}
          </Fact>
          <Fact label="Time to film">24 h once taken</Fact>
          <Fact label="Video">{VIDEO_RULE}</Fact>
        </dl>

        <p className="px-8 pt-3 text-[13px] leading-relaxed text-ink-soft">
          An AI checks the video against the dare. A clear pass pays out right away and a clear miss is rejected.
          Anything in between goes to {displayName(quest.creator)} to approve or reject; if they don’t answer in 24
          hours, it approves itself.
        </p>

        <Attempts questId={quest.id} claims={claims} viewerIsCreator={false} />
      </main>

      {canTake &&
        (authenticated ? (
          <Footer>
            <button type="button" onClick={() => setTakeOpen(true)} disabled={!online} className={`${button()} w-full`}>
              {online ? 'Take this quest' : 'You’re offline'}
            </button>
            <p className="tabular text-center text-[13px] text-ink-soft">{depositNote}</p>
          </Footer>
        ) : (
          <Footer>
            <button type="button" onClick={login} className={`${button()} w-full`}>
              Sign in to take this quest
            </button>
            <p className="tabular text-center text-[13px] text-ink-soft">{depositNote}</p>
          </Footer>
        ))}

      <TakeSheet
        open={takeOpen}
        onClose={() => !claim.isPending && setTakeOpen(false)}
        quest={quest}
        stake={stake}
        pending={claim.isPending}
        pendingLabel={
          claimStep === 'checking' ? 'Checking…' : claimStep === 'funding' ? 'Adding test QUEST…' : 'Confirm in your wallet…'
        }
        error={claim.error}
        onConfirm={() => claim.mutate()}
      />
    </div>
  )
}

function Creator({ quest }: { quest: Quest }) {
  const paid = quest.creator?.paid ?? 0
  const judged = paid + (quest.creator?.rejected ?? 0)
  return (
    <>
      <Avatar person={quest.creator} size={28} />
      <div className="min-w-0">
        <p className="truncate">
          <span className="font-semibold">{displayName(quest.creator)}</span>
          <span className="text-ink-soft"> · posted {timeAgo(quest.createdAt)}</span>
        </p>
        {/* The one thing a taker wants to know about a stranger: do they pay? */}
        {judged > 0 && (
          <p className="tabular truncate text-[13px] text-ink-soft">
            Paid out {paid} of {judged} finished {judged === 1 ? 'quest' : 'quests'}
          </p>
        )}
      </div>
    </>
  )
}

// ── B5 · Confirm taking it ──────────────────────────

function TakeSheet({
  open,
  onClose,
  quest,
  stake,
  pending,
  pendingLabel,
  error,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  quest: Quest
  stake: number
  pending: boolean
  pendingLabel: string
  error: Error | null
  onConfirm: () => void
}) {
  const balance = useTokenBalance()
  const online = useOnline()
  // On devnet the missing test QUEST is minted when they confirm.
  const canAfford = CLUSTER === 'devnet' || balance.data === undefined || balance.data >= stake

  return (
    <Sheet open={open} onClose={onClose} label="Take this quest">
      <h2 className="text-[22px] font-bold leading-tight">Take this quest?</h2>
      <p className="mt-1 line-clamp-2 text-[15px] text-ink-soft">{quest.description}</p>
      <ul className="mt-4 divide-y-[0.5px] divide-ink/15 rounded-[12px] bg-paper text-[15px]">
        <SheetRow label="You put down" value={money(quest, stake)} />
        <SheetRow label="If approved you get" value={money(quest, payout(quest, stake))} strong />
        <SheetRow label="Time to send your video" value="24 hours" />
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
        That’s the reward less the 2.5% fee, plus your deposit back. If you give up, run out of time or the video
        isn’t approved, your deposit goes to the poster.
      </p>
      {!canAfford && (
        <div className="mt-4">
          <TokenBalance />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[15px] text-wax">
          {errorMessage(error)}
        </p>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending || !canAfford || !online}
        className={`${button()} mt-5 w-full`}
      >
        {pending ? pendingLabel : !online ? 'You’re offline' : 'Deposit and take it'}
      </button>
      <p className="mt-2 text-center text-[13px] text-ink-soft">Your wallet will ask you to confirm</p>
      <button type="button" onClick={onClose} disabled={pending} className="press mt-1 h-11 w-full text-[17px] text-moss">
        Cancel
      </button>
    </Sheet>
  )
}

function SheetRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-ink-soft">{label}</span>
      <span className={`tabular text-right ${strong ? 'font-semibold text-moss-deep' : ''}`}>{value}</span>
    </li>
  )
}

// ── Q1, Q2 · The poster’s own quest ─────────────────

function PosterView({ quest, claims }: { quest: Quest; claims: QuestClaim[] }) {
  const { cancel } = useQuestActions(quest)
  const live = claims.find((c) => c.status === 'active' || c.status === 'submitted')
  const settled = claims.filter((c) => c !== live)
  const reward = money(quest, quest.rewardAmount)
  const who = displayName(live?.claimer)
  const checked = live?.status === 'submitted' && live.proof?.aiDecision != null
  const waiting = quest.status === 'active' && !live

  const pill =
    live?.status === 'active' ? (
      <Pill tone="warn">Being filmed</Pill>
    ) : live?.status === 'submitted' ? (
      checked ? <Pill tone="warn">Needs you</Pill> : <Pill>Being checked</Pill>
    ) : waiting ? (
      <Pill tone="good">Posted by you</Pill>
    ) : (
      <Pill tone={quest.status === 'completed' ? 'good' : quest.status === 'failed' ? 'bad' : 'plain'}>
        {questAvailability(quest)}
      </Pill>
    )

  return (
    <div className={waiting || checked ? FOOTER_SPACE : TAB_BAR_SPACE}>
      <NavBar title="" back="Activity" backHref="/activity" right={pill} />
      <main>
        <Title>{quest.description}</Title>
        <RewardCard quest={quest} />
        <TimelineCard quest={quest} claims={claims} />

        {live?.status === 'submitted' ? (
          checked ? (
            <Card title={`${who} sent a video`} tone="act">
              Your call.{' '}
              {live.reviewDeadline && roughLeft(live.reviewDeadline)
                ? `If you don’t answer in ${roughLeft(live.reviewDeadline)}, it approves itself and ${who} is paid.`
                : ''}
            </Card>
          ) : (
            <Card title={`${who} sent a video`}>
              The AI is checking it now. A clear pass pays {who} right away; a close call comes to you to decide.
            </Card>
          )
        ) : live?.status === 'active' ? (
          <>
            <Card title={`${who} is on it`} person={live.claimer} href={live.claimer ? `/u/${live.claimer.pubkey}` : undefined}>
              {roughLeft(live.proofDeadline) ? `Video due in ${roughLeft(live.proofDeadline)}` : 'Their time to send a video ran out'}{' '}
              · put down {money(quest, live.stakeAmount)}
            </Card>
            <p className="mx-4 mt-3 rounded-[12px] border border-moss/25 bg-moss-pale/60 px-4 py-3 text-[13px] leading-relaxed text-moss-deep">
              The reward stays locked while {who} films. If time runs out, you get your {reward} back plus {who}’s
              deposit.
            </p>
          </>
        ) : waiting ? (
          <Card title="Waiting for someone to take it">
            {quest.deadline && remaining(quest.deadline) ? `Open for ${openLeft(quest.deadline)}. ` : ''}If nobody takes
            it, the {reward} comes back to you.
          </Card>
        ) : (
          <Card title={posterDoneTitle(quest)}>{closedLine(quest)}</Card>
        )}

        <Attempts questId={quest.id} claims={settled} viewerIsCreator />
      </main>

      {checked && (
        <Footer>
          <Link href={`/q/${quest.id}/review`} className={`${button()} w-full`}>
            Review the video
          </Link>
        </Footer>
      )}
      {waiting && (
        <Footer>
          <button
            type="button"
            onClick={() => shareLink(`${window.location.origin}/q/${quest.id}`, quest.description)}
            className={`${button()} w-full`}
          >
            Share link
          </button>
          <ConfirmButton
            variant="link"
            label={`Cancel quest and get ${reward} back`}
            question={`Cancel this quest? The ${reward} goes back to your wallet.`}
            confirmLabel="Cancel quest"
            pending={cancel.isPending}
            onConfirm={() => cancel.mutate()}
          />
          <ErrorLine error={cancel.error} />
        </Footer>
      )}
    </div>
  )
}

/** "2 more days", "5 more hours", "40 more minutes". */
function openLeft(deadline: number): string {
  const left = roughLeft(deadline) ?? ''
  const [count, unit] = left.split(' ')
  const word = unit === 'min' ? 'minute' : unit === 'h' ? 'hour' : 'day'
  return `${count} more ${word}${count === '1' ? '' : 's'}`
}

function posterDoneTitle(quest: Quest): string {
  return {
    completed: 'Done and paid out',
    failed: 'Not approved · reward back with you',
    cancelled: 'You cancelled it',
    expired: 'Nobody took it · reward back with you',
    active: 'Waiting',
    claimed: 'Someone is on it',
  }[quest.status]
}

// ── T1 · You’re on it ───────────────────────────────

function TakingView({ quest, claims, claim }: { quest: Quest; claims: QuestClaim[]; claim: QuestClaim }) {
  useTick()
  const router = useRouter()
  const { abandon } = useQuestActions(quest)
  const inTime = remaining(claim.proofDeadline) !== null
  const deposit = money(quest, claim.stakeAmount)

  return (
    <div className={TALL_FOOTER_SPACE}>
      <NavBar title="" back="Activity" backHref="/activity" right={<Pill tone="warn">You’re on it</Pill>} />
      <main>
        <Title>{quest.description}</Title>

        <div className="mx-4 mt-4 rounded-[16px] bg-paper-raised px-5 py-5 text-center">
          {inTime ? (
            <>
              <p className="tabular font-display text-[46px] leading-none text-wax" aria-live="off">
                {countdown(claim.proofDeadline)}
              </p>
              <p className="mt-2 text-[15px] text-ink-soft">left to send your video</p>
            </>
          ) : (
            <>
              <p className="font-display text-[30px] leading-none text-wax">Time’s up</p>
              <p className="mt-2 text-[15px] text-ink-soft">Your time to send a video has run out.</p>
            </>
          )}
        </div>

        <TimelineCard quest={quest} claims={claims} />

        <dl className={`${groupedList} mt-3`}>
          <Fact label="Reward">{money(quest, quest.rewardAmount)}</Fact>
          <Fact label="Your deposit">{deposit}</Fact>
          <Fact label="Video">{VIDEO_RULE}</Fact>
        </dl>
        <p className="tabular px-8 pt-3 text-[13px] leading-relaxed text-ink-soft">
          If it’s approved you get {money(quest, payout(quest, claim.stakeAmount))}: the reward less the 2.5% fee, plus
          your deposit back.
        </p>
      </main>

      <Footer>
        {inTime && (
          <>
            <Link href={`/q/${quest.id}/record`} className={`${button()} w-full`}>
              Record your video
            </Link>
            <label className="press flex h-11 w-full cursor-pointer items-center justify-center text-[17px] text-moss">
              Choose from library
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  stashPickedVideo(file)
                  router.push(`/q/${quest.id}/record`)
                }}
              />
            </label>
          </>
        )}
        <ConfirmButton
          variant="link"
          label={`Give up (lose your ${deposit} deposit)`}
          question={`Give up this quest? Your ${deposit} deposit goes to the poster.`}
          confirmLabel="Give up"
          pending={abandon.isPending}
          onConfirm={() => abandon.mutate(claim.id)}
        />
        <ErrorLine error={abandon.error} />
      </Footer>
    </div>
  )
}

// ── T5 · Video sent ─────────────────────────────────

function SentView({ quest, claims, claim }: { quest: Quest; claims: QuestClaim[]; claim: QuestClaim }) {
  const poster = displayName(quest.creator)
  const checked = claim.proof?.aiDecision != null
  const left = claim.reviewDeadline ? roughLeft(claim.reviewDeadline) : null

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title=""
        back="Activity"
        backHref="/activity"
        right={<Pill>{checked ? 'Being reviewed' : 'Being checked'}</Pill>}
      />
      <main>
        <Title>{quest.description}</Title>
        <TimelineCard quest={quest} claims={claims} />

        <Card title="Video sent">
          {checked
            ? `The AI wasn’t sure, so ${poster} decides.${left ? ` No answer in ${left} and it approves itself.` : ''}`
            : `The AI is checking it now, which usually takes a minute. A clear pass pays you right away. If it’s a close call, ${poster} can approve or reject it, and no answer in 24 hours approves it.`}
        </Card>

        {claim.proof && (
          <VideoRow
            proof={claim.proof}
            title="Your video"
            sub={`Sent ${timeAgo(claim.proof.createdAt)} · ${formatClock(claim.proof.durationSeconds)}`}
          />
        )}

        <div className="px-4 pt-6">
          <Link href="/" className={`${button('outline')} w-full`}>
            Find another quest
          </Link>
        </div>
      </main>
    </div>
  )
}

// ── T6 · Paid ───────────────────────────────────────

/** Shows the payout once per claim, then the normal quest page. */
function PaidGate({ quest, claim, claims, me }: { quest: Quest; claim: QuestClaim; claims: QuestClaim[]; me: User | undefined }) {
  const key = `quest:result-seen:${claim.id}`
  const [seen, setSeen] = useState<boolean | null>(null)
  useEffect(() => {
    try {
      setSeen(sessionStorage.getItem(key) === '1')
    } catch {
      setSeen(false)
    }
  }, [key])

  function dismiss() {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // Private mode: shows again next time, which is fine.
    }
    setSeen(true)
  }

  if (seen === null) return null
  if (seen) return <BrowseView quest={quest} claims={claims} me={me} />
  return <PaidView quest={quest} claim={claim} onDone={dismiss} />
}

function PaidView({ quest, claim, onDone }: { quest: Quest; claim: QuestClaim; onDone: () => void }) {
  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title=""
        right={
          <button type="button" onClick={onDone} className="press -mr-2 h-11 px-2 text-[17px] font-semibold text-moss">
            Done
          </button>
        }
      />
      <main className="flex flex-col items-center px-6 text-center">
        <Image
          src="/art/paid.jpg"
          alt="The knight raises a pouch of gold while the wizard cheers"
          width={780}
          height={650}
          priority
          className="art-fade w-full max-w-[320px]"
        />
        <div className="-mt-2">
          <Pill tone="good">Approved</Pill>
        </div>
        <h1 className="mt-3 font-display text-[30px] leading-tight text-moss">You did it</h1>
        <p className="tabular mt-1 font-display text-[40px] leading-none text-moss">
          {money(quest, payout(quest, claim.stakeAmount))}
        </p>
        <p className="tabular mt-3 max-w-[21rem] text-[15px] leading-relaxed text-ink-soft">
          is in your wallet: the {money(quest, quest.rewardAmount)} reward less the 2.5% fee, plus your{' '}
          {money(quest, claim.stakeAmount)} deposit back.
        </p>
        <div className="mt-6 flex w-full flex-col gap-1.5">
          <Link href="/" className={`${button()} w-full`}>
            Find another quest
          </Link>
          <button
            type="button"
            onClick={() => shareLink(`${window.location.origin}/q/${quest.id}`, `I did it: ${quest.description}`)}
            className="press h-11 w-full text-[17px] text-moss"
          >
            Share your video
          </button>
        </div>
      </main>
    </div>
  )
}

// ── T7 · Not approved ───────────────────────────────

function RejectedView({ quest, claim }: { quest: Quest; claim: QuestClaim }) {
  const poster = displayName(quest.creator)
  const proof = claim.proof
  const byAi = proof?.decidedBy === 'ai'
  const reason = proof?.rejectReason ?? (byAi ? proof?.aiReasoning : null)

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="" back="Activity" backHref="/activity" right={<Pill tone="bad">Not approved</Pill>} />
      <main>
        <Title>{quest.description}</Title>

        <div className="mx-4 mt-4 rounded-[16px] bg-paper-raised px-5 py-4">
          <p className="text-[17px] font-semibold">{byAi ? 'The AI check rejected it' : `${poster} rejected it`}</p>
          {reason ? (
            <blockquote className="mt-2 border-l-2 border-wax/40 pl-3 text-[15px] leading-relaxed text-ink-soft">“{reason}”</blockquote>
          ) : (
            <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">No reason was given.</p>
          )}
        </div>

        <dl className={`${groupedList} mt-3`}>
          <Fact label="AI check">{aiVerdict(proof)}</Fact>
          <Fact label="Your deposit">
            {money(quest, claim.stakeAmount)} went to {poster}
          </Fact>
        </dl>

        {proof && <VideoRow proof={proof} title="Watch your video" sub={`Sent ${timeAgo(proof.createdAt)} · ${formatClock(proof.durationSeconds)}`} />}

        <div className="px-4 pt-6">
          <Link href="/" className={`${button()} w-full`}>
            Back to quests
          </Link>
        </div>
      </main>
    </div>
  )
}

// ── P5 · Just posted ────────────────────────────────

/** How long it was posted for: "open for 3 days", "open for 1 week", "no time limit". */
function openFor(quest: Quest): string {
  if (!quest.deadline) return 'no time limit'
  const hours = Math.max(1, Math.round((quest.deadline - quest.createdAt) / 3600))
  if (hours < 48) return `open for ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return days === 7 ? 'open for 1 week' : `open for ${days} days`
}

function PostedView({ quest, onDone }: { quest: Quest; onDone: () => void }) {
  const reward = money(quest, quest.rewardAmount)
  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar
        title=""
        right={
          <button type="button" onClick={onDone} className="press -mr-2 h-11 px-2 text-[17px] font-semibold text-moss">
            Done
          </button>
        }
      />
      <main className="flex flex-col items-center px-6 text-center">
        <Image
          src="/art/posted.jpg"
          alt="The wizard pins a sealed notice to the quest board"
          width={780}
          height={650}
          priority
          className="art-fade w-full max-w-[320px]"
        />
        <h1 className="-mt-2 font-display text-[30px] leading-tight text-moss">Your quest is live</h1>
        <p className="tabular mt-2 max-w-[21rem] text-[15px] leading-relaxed text-ink-soft">
          {reward} is locked. Send it to someone who’d do it.
        </p>
        <div className="mt-4 w-full rounded-[16px] bg-paper-raised px-4 py-3.5 text-left">
          <p className="line-clamp-3 text-[17px] leading-snug">{quest.description}</p>
          <p className="tabular mt-1.5 text-[13px] text-ink-soft">
            {reward} · {openFor(quest)}
          </p>
        </div>
        <div className="mt-6 flex w-full flex-col gap-1.5">
          <button
            type="button"
            onClick={() => shareLink(`${window.location.origin}/q/${quest.id}`, quest.description)}
            className={`${button()} w-full`}
          >
            Share link
          </button>
          <button type="button" onClick={onDone} className="press h-11 w-full text-[17px] text-moss">
            View quest
          </button>
        </div>
      </main>
    </div>
  )
}
