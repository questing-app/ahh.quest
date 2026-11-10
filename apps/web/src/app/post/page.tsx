'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { SectionHeader, groupedList } from '@/components/notice'
import { Segmented } from '@/components/segmented'
import { button } from '@/components/button'
import { createQuestIx, fetchConfig, sha256 } from '@quest/sdk'
import { useApi, useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { CLUSTER, program, useSendTransaction, useWallet } from '@/lib/chain'
import { useTokenBalance } from '@/components/token-balance'
import { useOnline } from '@/lib/network'
import type { Quest } from '@/lib/types'
import { MIN_REWARD_UNITS, TOKENS, feeFor, formatUnits, shortAddress, toUnits } from '@/lib/tokens'

const STEPS = ['Challenge', 'Reward', 'Who and when', 'Review'] as const
const HEADINGS = ['What do they have to do?', 'What’s it worth?', 'Who can take it?', 'Ready to post?']
const DRAFT_KEY = 'quest.post.draft'

type Draft = {
  description: string
  amount: string
  questType: 'open' | 'direct'
  target: string
  timeLimit: number | null
}

function readDraft(): Partial<Draft> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Private mode: the draft just isn't kept.
  }
}
const MAX_LENGTH = 280

/** Short label on the chip, full wording in the field. */
const IDEAS = [
  { label: 'Cold shower, 60 s', text: 'Stand under a fully cold shower for 60 seconds' },
  { label: 'Eat a whole lemon', text: 'Eat a whole lemon, peel and all' },
  { label: 'Sing in public', text: 'Sing a full chorus out loud in a busy public place' },
  { label: 'Plank for 3 minutes', text: 'Hold a plank for 3 minutes without dropping' },
]

const QUICK_AMOUNTS = ['10', '25', '50', '100']

const chip =
  'press rounded-full border border-[#D8CDB3] bg-paper-raised px-3 py-[7px] text-[13px] leading-none whitespace-nowrap'
const chipOn = 'press rounded-full border border-ink bg-ink px-3 py-[7px] text-[13px] leading-none whitespace-nowrap text-paper-raised'
const line = 'flex items-start justify-between gap-3 px-4 py-2.5 text-[15px]'

const TIME_LIMITS = [
  { label: 'No limit', hours: null },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
] as const

const WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export default function PostQuestPage() {
  const { ready, authenticated, login } = useSession()
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(0)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [questType, setQuestType] = useState<'open' | 'direct'>('open')
  const [target, setTarget] = useState('')
  const [timeLimit, setTimeLimit] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [restored, setRestored] = useState(false)

  // Leaving for another tab shouldn't throw away what they typed.
  useEffect(() => {
    const draft = readDraft()
    if (draft.description) setDescription(draft.description)
    if (draft.amount) setAmount(draft.amount)
    if (draft.questType) setQuestType(draft.questType)
    if (draft.target) setTarget(draft.target)
    if (draft.timeLimit !== undefined) setTimeLimit(draft.timeLimit)
    setRestored(true)
  }, [])
  useEffect(() => {
    if (!restored) return
    const empty = !description && !amount && !target && questType === 'open' && timeLimit === null
    writeDraft(empty ? null : { description, amount, questType, target, timeLimit })
  }, [restored, description, amount, questType, target, timeLimit])

  const [phase, setPhase] = useState<'idle' | 'checking' | 'funding' | 'signing' | 'saving'>('idle')
  const sendTransaction = useSendTransaction()
  const { address } = useWallet()
  const balance = useTokenBalance()
  const online = useOnline()

  const token = TOKENS[0]
  const units = toUnits(amount, token.decimals)
  const minimum = `${formatUnits(MIN_REWARD_UNITS, token.decimals)} ${token.symbol}`

  const problems: (string | null)[] = [
    description.trim().length < 10 ? 'Describe the challenge in at least a few words.' : null,
    units === null
      ? 'Enter an amount, like 25 or 0.5.'
      : units < MIN_REWARD_UNITS
        ? `The smallest reward is ${minimum}.`
        : CLUSTER !== 'devnet' && balance.data !== undefined && units > balance.data
          ? 'That’s more than you have in your wallet.'
          : null,
    questType === 'direct' && !WALLET_PATTERN.test(target.trim())
      ? 'Paste a Solana wallet address.'
      : questType === 'direct' && target.trim() === address
        ? 'You can’t post a quest for yourself.'
        : null,
    null,
  ]

  // Check first so a refused quest never locks funds, then fund the escrow
  // on-chain, then tell the API, which reads everything back from the chain.
  const post = useMutation({
    mutationFn: async () => {
      if (!address || units === null) throw new Error('Your wallet is still loading.')
      const text = description.trim()
      setPhase('checking')
      await api('/api/quests/check', { json: { description: text } })

      // Testing on devnet: mint whatever test QUEST is missing instead of blocking.
      const held = balance.data ?? 0
      if (CLUSTER === 'devnet' && units > held) {
        setPhase('funding')
        await api('/api/dev/faucet', { json: { amount: units - held } })
        await queryClient.invalidateQueries({ queryKey: ['balance'] })
      }

      setPhase('signing')
      const config = await fetchConfig(program)
      if (!config) throw new Error('Quest isn’t set up on this network yet.')
      const questId = config.questCount.toString()
      const ix = await createQuestIx(program, {
        creator: address,
        questId,
        mint: token.mint,
        rewardAmount: units,
        target: questType === 'direct' ? target.trim() : null,
        timeLimit: timeLimit ? Math.floor(Date.now() / 1000) + timeLimit * 3600 : null,
        descriptionHash: await sha256(text),
      })
      const txSignature = await sendTransaction([ix])

      setPhase('saving')
      return api<Quest>('/api/quests', {
        json: { description: text, onchainId: questId, txSignature },
      })
    },
    onSuccess: (quest) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      writeDraft(null)
      router.replace(`/q/${quest.id}?posted=1`)
    },
    onSettled: () => setPhase('idle'),
  })

  function next() {
    setTouched(true)
    if (problems[step]) return
    setTouched(false)
    setStep((s) => s + 1)
  }

  if (ready && !authenticated) {
    return (
      <div className={TAB_BAR_SPACE}>
        <NavBar title="New Quest" large />
        <main className="flex flex-col items-center px-8 pt-4 text-center">
          <Image src="/art/wallet.png" alt="" width={390} height={400} className="art-fade w-full max-w-[240px]" />
          <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">
            Sign in to post a quest. We’ll set up a wallet to hold the reward if you don’t have one.
          </p>
          <button type="button" onClick={login} className={`${button()} mt-6 w-full`}>
            Sign in
          </button>
        </main>
      </div>
    )
  }

  const error = touched ? problems[step] : null
  const fee = units ? feeFor(units) : 0
  const field =
    'w-full rounded-[12px] bg-paper-raised px-4 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40'

  return (
    <div className="pb-[calc(49px+env(safe-area-inset-bottom)+120px)]">
      <NavBar
        title="New Quest"
        back={step > 0 ? STEPS[step - 1] : false}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        left={
          step === 0 ? (
            <button
              type="button"
              onClick={() => {
                writeDraft(null)
                router.push('/')
              }}
              className="press flex h-11 items-center px-2 text-[17px] text-moss"
            >
              Cancel
            </button>
          ) : undefined
        }
      />
      <div className="mx-4 mt-1 flex gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-moss' : 'bg-rule'}`}
          />
        ))}
      </div>

      <form
        id="post-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (step < STEPS.length - 1) next()
          else post.mutate()
        }}
      >
        <p className="tabular px-4 pt-4 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <h1 className="px-4 pt-1 font-display text-[30px] leading-tight text-moss">{HEADINGS[step]}</h1>

        {step === 0 && (
          <div className="mt-4 px-4">
            <label htmlFor="description" className="sr-only">
              What counts as done
            </label>
            <textarea
              id="description"
              value={description}
              maxLength={MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Do 50 pushups in under 2 minutes"
              className={`${field} resize-none py-3 leading-snug`}
            />
            <p className="tabular mt-1.5 flex justify-between gap-3 text-[13px] text-ink-soft">
              <span>Make it something one video can prove.</span>
              <span>
                {description.length}/{MAX_LENGTH}
              </span>
            </p>

            <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">Need an idea?</h2>
            <div className="mt-2 flex flex-wrap gap-[7px]">
              {IDEAS.map((idea) => (
                <button key={idea.label} type="button" onClick={() => setDescription(idea.text)} className={chip}>
                  {idea.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="px-4">
              <label htmlFor="amount" className="sr-only">
                Reward
              </label>
              <div className="flex items-baseline justify-center gap-2 pb-1 pt-5">
                <input
                  id="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="0"
                  size={Math.max(1, amount.length)}
                  className="tabular min-w-[1ch] max-w-full bg-transparent text-center font-display text-[56px] leading-none text-moss placeholder:text-ink/20 focus:outline-none"
                />
                <span className="text-[18px] font-semibold text-moss">{token.symbol}</span>
              </div>
              <p className="tabular text-center text-[14px] text-ink-soft">
                {balance.data === undefined
                  ? '\u00a0'
                  : `You have ${formatUnits(balance.data, token.decimals)} ${token.symbol}`}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-[7px]">
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={amount === value}
                    onClick={() => setAmount(value)}
                    className={`tabular ${amount === value ? chipOn : chip}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <dl className={`${groupedList} tabular mt-5`}>
              <div className={line}>
                <dt>Reward, locked up</dt>
                <dd className="text-right text-ink-soft">
                  {formatUnits(units ?? 0, token.decimals)} {token.symbol}
                </dd>
              </div>
              <div className={line}>
                <dt>
                  Quest fee, 2.5%
                  <span className="block text-[13px] text-ink-soft">Comes out of the reward when it’s paid</span>
                </dt>
                <dd className="text-right text-ink-soft">
                  {formatUnits(fee, token.decimals)} {token.symbol}
                </dd>
              </div>
              <div className={line}>
                <dt>Network fee</dt>
                <dd className="text-right text-ink-soft">under 0.01 SOL</dd>
              </div>
            </dl>
            {CLUSTER === 'devnet' && (
              <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
                These are test tokens. If you don’t hold enough, the rest is added to your wallet when you post.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Segmented
              label="Who can take it"
              className="mx-4 mt-4"
              value={questType}
              onChange={setQuestType}
              options={[
                { id: 'open', label: 'Anyone' },
                { id: 'direct', label: 'One person' },
              ]}
            />
            {questType === 'direct' && (
              <div className="px-4 pt-3">
                <label htmlFor="target" className="sr-only">
                  Their Solana wallet address
                </label>
                <input
                  id="target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Their Solana wallet address"
                  className={`${field} h-[48px] font-mono !text-[16px]`}
                />
              </div>
            )}
            <p className="px-4 pt-3 text-[14px] leading-relaxed text-ink-soft">
              {questType === 'open'
                ? 'The first person to take it gets 24 hours to film it.'
                : 'Only that wallet can take it. They get 24 hours to film it.'}
            </p>

            <SectionHeader id="open-for">How long is it open?</SectionHeader>
            <div className={groupedList} role="radiogroup" aria-labelledby="open-for">
              {TIME_LIMITS.map((option) => (
                <Choice
                  key={option.label}
                  selected={timeLimit === option.hours}
                  onSelect={() => setTimeLimit(option.hours)}
                  title={option.label}
                />
              ))}
            </div>
            <p className="px-4 pt-3 text-[14px] leading-relaxed text-ink-soft">
              {timeLimit === null
                ? 'It stays open until someone takes it or you cancel.'
                : 'If nobody takes it in time, the reward comes back to you.'}
            </p>
          </>
        )}

        {step === 3 && units !== null && (
          <>
            <div className="mx-4 mt-4 rounded-[14px] border border-rule bg-paper-raised px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-ink-soft">Challenge</span>
                <button type="button" onClick={() => setStep(0)} className="press -my-3 py-3 pl-4 text-[14px] text-moss">
                  Edit
                </button>
              </div>
              <p className="mt-1 break-words text-[16px] font-bold leading-[1.3]">{description.trim()}</p>
            </div>

            <dl className={`${groupedList} tabular mt-3`}>
              <Summary label="Reward" onEdit={() => setStep(1)}>
                {formatUnits(units, token.decimals)} {token.symbol}
              </Summary>
              <Summary label="Who" onEdit={() => setStep(2)}>
                {questType === 'open' ? 'Anyone' : shortAddress(target.trim())}
              </Summary>
              <Summary label="Open for" onEdit={() => setStep(2)}>
                {TIME_LIMITS.find((t) => t.hours === timeLimit)?.label}
              </Summary>
              <div className={line}>
                <dt>
                  Total from your wallet
                  <span className="block text-[13px] text-ink-soft">
                    The 2.5% fee comes out of the reward, so the winner gets {formatUnits(units - fee, token.decimals)}
                  </span>
                </dt>
                <dd className="shrink-0 text-right font-semibold">
                  {formatUnits(units, token.decimals)} {token.symbol}
                </dd>
              </div>
            </dl>

            <p className="mx-4 mt-3 rounded-[14px] border border-[#C9D1AE] bg-moss-pale px-4 py-3 text-[13px] leading-[1.45] text-moss-deep">
              The reward is locked until a video is approved. Cancel any time before someone takes it and you get it all
              back.
            </p>
          </>
        )}

        {(error || post.error) && (
          <p role="alert" className="px-6 pt-4 text-center text-[15px] text-wax">
            {error ?? errorMessage(post.error)}
          </p>
        )}
      </form>

      {/* Primary action sits just above the tab bar, where the thumb is. */}
      <div className="chrome fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-3 pt-6">
        <button
          type="submit"
          form="post-form"
          disabled={post.isPending || (!online && step === STEPS.length - 1)}
          className={`${button()} w-full`}
        >
          {step < STEPS.length - 1
            ? 'Next'
            : !online
              ? 'You’re offline'
              : phase === 'checking'
              ? 'Checking your quest…'
              : phase === 'funding'
                ? 'Adding test QUEST…'
                : phase === 'signing'
                ? 'Confirm in your wallet…'
                : post.isPending
                  ? 'Posting…'
                  : `Post and lock ${formatUnits(units ?? 0, token.decimals)} ${token.symbol}`}
        </button>
        {step === STEPS.length - 1 && (
          <p className="pt-1.5 text-center text-[12px] text-ink-soft">Your wallet will ask you to confirm</p>
        )}
      </div>
    </div>
  )
}

function Choice({ selected, onSelect, title }: { selected: boolean; onSelect: () => void; title: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex min-h-[46px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[16px] transition-colors active:bg-paper-sunk"
    >
      {title}
      <span
        aria-hidden
        className={`h-5 w-5 shrink-0 rounded-full ${selected ? 'border-[6px] border-moss' : 'border-2 border-[#D8CDB3]'}`}
      />
    </button>
  )
}

function Summary({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px]">
      <dt>{label}</dt>
      <dd className="flex min-w-0 items-center gap-3 text-right text-ink-soft">
        <span className="min-w-0 truncate">{children}</span>
        <button type="button" onClick={onEdit} className="press -my-3 shrink-0 py-3 text-[14px] text-moss">
          Edit
        </button>
      </dd>
    </div>
  )
}
