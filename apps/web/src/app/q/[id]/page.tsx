'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { Avatar } from '@/components/avatar'
import { SectionHeader, groupedList } from '@/components/notice'
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
import { useMe, useQuest, useQuestClaims } from '@/lib/queries'
import { useApi, useSession } from '@/lib/session'
import { displayName, type Quest, type QuestClaim, type User } from '@/lib/types'
import { feeFor, formatUnits, shortAddress, stakeFor, tokenForMint } from '@/lib/tokens'
import { formatDate, remaining, timeAgo } from '@/lib/time'
import { ApiError, errorMessage } from '@/lib/api'
import { CLUSTER, explorerAddress, program, useSendTransaction, useWallet } from '@/lib/chain'
import { useOnline } from '@/lib/network'
import { shareLink } from '@/lib/share'
import { abandonClaimIx, cancelQuestIx, claimQuestIx } from '@quest/sdk'

/** Space under the content for the pinned action and the tab bar. */
const FOOTER_SPACE = 'pb-[calc(49px+env(safe-area-inset-bottom)+132px)]'

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

  const decided = me ? list.find((c) => c.claimerId === me.id && (c.status === 'approved' || c.status === 'rejected')) : undefined
  if (decided && !isPoster) {
    return <ResultGate quest={q} claim={decided} claims={list} me={me} />
  }

  return <QuestDetail quest={q} claims={list} me={me} />
}

function QuestDetail({ quest, claims, me }: { quest: Quest; claims: QuestClaim[]; me: User | undefined }) {
  const token = tokenForMint(quest.rewardMint)
  const fee = feeFor(quest.rewardAmount)
  const isPoster = me?.id === quest.creatorId

  return (
    <div className={FOOTER_SPACE}>
      <NavBar title="Quest" back="Quests" />
      <main>
        <article className="px-4 pt-2">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-moss">
            {isPoster ? 'Posted by you' : questAvailability(quest)}
          </p>
          <h1 className="mt-2 font-display text-[28px] leading-[1.12]">{quest.description}</h1>
          {!isPoster &&
            (quest.creator ? (
              <Link href={`/u/${quest.creator.pubkey}`} className="press mt-3 flex min-h-[44px] items-center gap-2.5 text-[15px]">
                <Creator quest={quest} />
              </Link>
            ) : (
              <div className="mt-3 flex min-h-[44px] items-center gap-2.5 text-[15px]">
                <Creator quest={quest} />
              </div>
            ))}
        </article>

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
            Winner gets {formatUnits(quest.rewardAmount - fee, token.decimals)} after the 2.5% fee
          </p>
          <div className="mt-5 border-t-[0.5px] border-ink/15 pt-4">
            <Timeline stops={questStops(quest, claims)} />
          </div>
        </div>

        <QuestState quest={quest} claims={claims} me={me} />

        <SectionHeader>Details</SectionHeader>
        <dl className={groupedList}>
          <Fact label="Who can take it">
            {quest.questType === 'direct' && quest.targetPubkey ? `Only ${shortAddress(quest.targetPubkey)}` : 'Anyone'}
          </Fact>
          <Fact label="Ends">
            {quest.deadline
              ? remaining(quest.deadline)
                ? `${remaining(quest.deadline)} left`
                : formatDate(quest.deadline)
              : 'No end date'}
          </Fact>
          <Fact label="Deposit to take it">
            {formatUnits(stakeFor(quest.rewardAmount), token.decimals)} {token.symbol}
          </Fact>
          <Fact label="Time to film">24 hours once taken</Fact>
          <Fact label="Video">
            One take, {MIN_SECONDS}–{MAX_SECONDS} seconds
          </Fact>
        </dl>

        <SectionHeader>How it’s judged</SectionHeader>
        <p className="px-8 text-[13px] leading-relaxed text-ink-soft">
          The video is checked against the description. A clear pass pays out right away and a clear fail is rejected.
          Close calls go to {isPoster ? 'you' : displayName(quest.creator)}, with 24 hours to decide before it approves
          itself.
        </p>

        <Attempts questId={quest.id} claims={claims} viewerIsCreator={isPoster} />
      </main>
    </div>
  )
}

/** The status card and pinned action for whoever is looking. */
function QuestState({ quest, claims, me }: { quest: Quest; claims: QuestClaim[]; me: User | undefined }) {
  const { ready, authenticated, login } = useSession()
  const api = useApi()
  const queryClient = useQueryClient()
  const sendTransaction = useSendTransaction()
  const { address } = useWallet()
  const [takeOpen, setTakeOpen] = useState(false)
  const balance = useTokenBalance()
  const online = useOnline()

  const token = tokenForMint(quest.rewardMint)
  const amount = (units: number) => `${formatUnits(units, token.decimals)} ${token.symbol}`
  const stake = stakeFor(quest.rewardAmount)
  const onChain = { questId: quest.onchainId, mint: quest.rewardMint }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quest', quest.id] })
    queryClient.invalidateQueries({ queryKey: ['mine'] })
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    queryClient.invalidateQueries({ queryKey: ['me'] })
    queryClient.invalidateQueries({ queryKey: ['balance'] })
  }

  // Each action is signed on-chain first; the API then mirrors what landed.
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
      setTakeOpen(false)
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
      toast(`Quest cancelled. ${amount(quest.rewardAmount)} is back in your wallet.`)
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

  const error = cancel.error ?? abandon.error
  const errorLine = error ? (
    <p role="alert" className="text-center text-[15px] text-wax">
      {errorMessage(error)}
    </p>
  ) : null

  if (!ready) return null

  const live = claims.find((c) => c.status === 'active' || c.status === 'submitted')
  const isPoster = me?.id === quest.creatorId
  const mine = me ? claims.find((c) => c.claimerId === me.id && (c.status === 'active' || c.status === 'submitted')) : undefined

  // ── Signed out
  if (!authenticated) {
    if (quest.status !== 'active') return <Card title="Not taking attempts">{closedLine(quest)}</Card>
    return (
      <Footer>
        <button type="button" onClick={login} className={`${button()} w-full`}>
          Sign in to take this quest
        </button>
        <p className="text-center text-[13px] text-ink-soft">You put down {amount(stake)} and get it back with the reward.</p>
      </Footer>
    )
  }

  if (!me || !address) return <Card title="Loading your account…" />

  // ── The poster
  if (isPoster) {
    if (live?.status === 'submitted') {
      const who = displayName(live.claimer)
      const checked = live.proof?.aiDecision !== null && live.proof?.aiDecision !== undefined
      const left = live.reviewDeadline ? remaining(live.reviewDeadline) : null
      return checked ? (
        <>
          <Card title={`${who} sent a video`} tone="act">
            Your call. {left ? `If you don’t answer in ${left}, it approves itself and ${who} is paid.` : ''}
          </Card>
          <Footer>
            <Link href={`/q/${quest.id}/review`} className={`${button()} w-full`}>
              Review the video
            </Link>
          </Footer>
        </>
      ) : (
        <Card title={`${who} sent a video`}>It’s being checked now. If it’s a close call, it comes to you to decide.</Card>
      )
    }
    if (live?.status === 'active') {
      const who = displayName(live.claimer)
      const left = remaining(live.proofDeadline)
      return (
        <>
          <Card title={`${who} is on it`} person={live.claimer} href={live.claimer ? `/u/${live.claimer.pubkey}` : undefined}>
            {left ? `Video due in ${left}` : 'Their time to send a video ran out'} · put down {amount(live.stakeAmount)}
          </Card>
          <p className="mx-4 mt-3 rounded-[12px] border border-moss/25 bg-moss-pale/60 px-4 py-3 text-[13px] leading-relaxed text-moss-deep">
            The reward stays locked while {who} films, so the quest can’t be cancelled now. If time runs out, you get
            your {amount(quest.rewardAmount)} back plus {who}’s deposit.
          </p>
        </>
      )
    }
    if (quest.status === 'active') {
      const left = quest.deadline ? remaining(quest.deadline) : null
      return (
        <>
          <Card title="Waiting for someone to take it">
            {left ? `Open for ${left} more. ` : ''}If nobody takes it, the {amount(quest.rewardAmount)} comes back to you.
          </Card>
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
              label={`Cancel quest and get ${amount(quest.rewardAmount)} back`}
              question={`Cancel this quest? The ${amount(quest.rewardAmount)} goes back to your wallet.`}
              confirmLabel="Cancel quest"
              pending={cancel.isPending}
              onConfirm={() => cancel.mutate()}
            />
            {errorLine}
          </Footer>
        </>
      )
    }
    return <Card title={posterDoneTitle(quest)}>{closedLine(quest)}</Card>
  }

  // ── Someone with a live attempt
  if (mine?.status === 'active') {
    const left = remaining(mine.proofDeadline)
    return (
      <>
        <Card title="You’re on it" tone="act">
          <span className="tabular mt-1 block font-display text-[30px] leading-none text-wax">{left ?? 'Time’s up'}</span>
          <span className="mt-2 block">
            {left
              ? `left to send one take, ${MIN_SECONDS}–${MAX_SECONDS} seconds. Get the whole thing in frame.`
              : 'Your time to send a video has run out.'}
          </span>
        </Card>
        <Footer>
          {left && (
            <Link href={`/q/${quest.id}/record`} className={`${button()} w-full`}>
              Record your video
            </Link>
          )}
          <ConfirmButton
            variant="link"
            label="Give up this quest"
            question={`Give up this quest? Your ${amount(stake)} deposit goes to the poster.`}
            confirmLabel="Give up"
            pending={abandon.isPending}
            onConfirm={() => abandon.mutate(mine.id)}
          />
          {errorLine}
        </Footer>
      </>
    )
  }
  if (mine?.status === 'submitted') {
    const checked = mine.proof?.aiDecision !== null && mine.proof?.aiDecision !== undefined
    const left = mine.reviewDeadline ? remaining(mine.reviewDeadline) : null
    return (
      <Card title="Video sent">
        {checked
          ? `It was a close call, so ${displayName(quest.creator)} decides.${left ? ` No answer in ${left} and it approves itself.` : ''}`
          : 'It’s being checked now, usually within a few minutes. A clear pass pays you right away.'}
      </Card>
    )
  }

  // ── Everyone else
  if (quest.status !== 'active') return <Card title="Not taking attempts">{closedLine(quest)}</Card>
  if (quest.questType === 'direct' && quest.targetPubkey !== me.pubkey) {
    return <Card title="Posted for someone else">Only {shortAddress(quest.targetPubkey!)} can take this one.</Card>
  }

  return (
    <>
      <Footer>
        <button type="button" onClick={() => setTakeOpen(true)} disabled={!online} className={`${button()} w-full`}>
          {online ? 'Take this quest' : 'You’re offline'}
        </button>
        <p className="tabular text-center text-[13px] text-ink-soft">{amount(stake)} deposit, back to you with the reward</p>
      </Footer>
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
    </>
  )
}

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
  const token = tokenForMint(quest.rewardMint)
  const amount = (units: number) => `${formatUnits(units, token.decimals)} ${token.symbol}`
  const balance = useTokenBalance()
  const online = useOnline()
  // On devnet the missing test QUEST is minted when they confirm.
  const canAfford = CLUSTER === 'devnet' || balance.data === undefined || balance.data >= stake
  const win = quest.rewardAmount - feeFor(quest.rewardAmount) + stake

  return (
    <Sheet open={open} onClose={onClose} label="Take this quest">
      <h2 className="text-[22px] font-bold leading-tight">Take this quest?</h2>
      <p className="mt-1 line-clamp-2 text-[15px] text-ink-soft">{quest.description}</p>
      <ul className="mt-4 divide-y-[0.5px] divide-ink/15 rounded-[12px] bg-paper text-[15px]">
        <SheetRow label="You put down now" value={amount(stake)} />
        <SheetRow label="Time to film" value="24 hours, one take" />
        <SheetRow label="If it’s approved" value={`You get ${amount(win)}`} strong />
        <SheetRow label="If not, or time runs out" value="Deposit goes to the poster" />
      </ul>
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
        {pending ? pendingLabel : !online ? 'You’re offline' : `Put down ${amount(stake)} and start`}
      </button>
      <button type="button" onClick={onClose} disabled={pending} className="press mt-1 h-11 w-full text-[17px] text-moss">
        Not now
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

/** Primary action pinned just above the tab bar, where the thumb is. */
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="chrome fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 border-t-[0.5px] border-ink/10 bg-paper/95 px-4 pb-3 pt-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[520px] flex-col gap-1.5">{children}</div>
    </div>
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

// ── Full-screen moments ─────────────────────────────

function PostedView({ quest, onDone }: { quest: Quest; onDone: () => void }) {
  const token = tokenForMint(quest.rewardMint)
  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="Posted" right={<button type="button" onClick={onDone} className="press -mr-2 h-11 px-2 text-[17px] font-semibold text-moss">Done</button>} />
      <main className="flex flex-col items-center px-6 text-center">
        <Image src="/art/posted.jpg" alt="The wizard pins a sealed notice to the quest board" width={780} height={650} priority className="art-fade w-full max-w-[340px]" />
        <h1 className="-mt-2 font-display text-[30px] leading-tight text-moss">Your quest is up</h1>
        <p className="mt-2 max-w-[21rem] text-[15px] leading-relaxed text-ink-soft">
          {formatUnits(quest.rewardAmount, token.decimals)} {token.symbol} is locked until someone’s video is approved.
          You can cancel and get it back until someone takes it.
        </p>
        <p className="mt-4 line-clamp-3 rounded-[12px] bg-paper-raised px-4 py-3 text-[15px] leading-snug">{quest.description}</p>
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

/** Shows the result once per claim, then the normal quest page. */
function ResultGate({ quest, claim, claims, me }: { quest: Quest; claim: QuestClaim; claims: QuestClaim[]; me: User | undefined }) {
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
  if (seen) return <QuestDetail quest={quest} claims={claims} me={me} />
  return <ResultView quest={quest} claim={claim} onDone={dismiss} />
}

function ResultView({ quest, claim, onDone }: { quest: Quest; claim: QuestClaim; onDone: () => void }) {
  const token = tokenForMint(quest.rewardMint)
  const amount = (units: number) => `${formatUnits(units, token.decimals)} ${token.symbol}`
  const fee = feeFor(quest.rewardAmount)
  const paid = claim.status === 'approved'
  const reason = claim.proof?.rejectReason ?? (claim.proof?.decidedBy === 'ai' ? claim.proof.aiReasoning : null)
  const by =
    claim.proof?.decidedBy === 'timeout'
      ? 'It approved itself after the poster didn’t answer.'
      : claim.proof?.decidedBy === 'ai'
        ? 'The video check decided.'
        : `${displayName(quest.creator)} decided.`

  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title={paid ? 'Paid' : 'Not approved'} back="Quests" />
      <main className="flex flex-col items-center px-6 text-center">
        <Image
          src={paid ? '/art/paid.jpg' : '/art/rejected.jpg'}
          alt={paid ? 'The knight raises a pouch of gold while the wizard cheers' : 'The wizard comforts the knight, who sits on a rock'}
          width={780}
          height={650}
          priority
          className="art-fade w-full max-w-[340px]"
        />
        <h1 className={`-mt-2 font-display text-[30px] leading-tight ${paid ? 'text-moss' : 'text-ink'}`}>
          {paid ? 'You got paid' : 'Not approved this time'}
        </h1>
        {paid ? (
          <p className="tabular mt-1 font-display text-[40px] leading-none text-moss">{amount(quest.rewardAmount - fee + claim.stakeAmount)}</p>
        ) : null}
        <p className="mt-3 max-w-[21rem] text-[15px] leading-relaxed text-ink-soft">
          {paid
            ? `The reward and your ${amount(claim.stakeAmount)} deposit are in your wallet. ${by}`
            : `Your ${amount(claim.stakeAmount)} deposit went to the poster. ${by}`}
        </p>
        {!paid && reason && (
          <blockquote className="mt-4 w-full rounded-[12px] bg-paper-raised px-4 py-3 text-left text-[15px] leading-relaxed">
            <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Why</span>
            {reason}
          </blockquote>
        )}
        <div className="mt-6 flex w-full flex-col gap-1.5">
          <Link href="/" className={`${button()} w-full`}>
            Find another quest
          </Link>
          <button type="button" onClick={onDone} className="press h-11 w-full text-[17px] text-moss">
            See the quest
          </button>
        </div>
      </main>
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5 text-[17px]">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink-soft">{children}</dd>
    </div>
  )
}
