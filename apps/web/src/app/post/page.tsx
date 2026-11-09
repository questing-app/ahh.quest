'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { SectionHeader, groupedList } from '@/components/notice'
import { button } from '@/components/button'
import { createQuestIx, fetchConfig, sha256 } from '@quest/sdk'
import { useApi, useSession } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { program, useSendTransaction, useWallet } from '@/lib/chain'
import { TokenBalance, useTokenBalance } from '@/components/token-balance'
import type { Quest } from '@/lib/types'
import { MIN_REWARD_UNITS, TOKENS, feeFor, formatUnits, shortAddress, toUnits } from '@/lib/tokens'

const STEPS = ['The challenge', 'The reward', 'Who and when', 'Check and post'] as const
const MAX_LENGTH = 280

const EXAMPLES = [
  'Order at a drive-through wearing a full suit of armour',
  'Eat a whole lemon, peel and all, without pulling a face',
  'Get a stranger to teach you a dance move, then do it with them',
]

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

  const [phase, setPhase] = useState<'idle' | 'signing' | 'saving'>('idle')
  const sendTransaction = useSendTransaction()
  const { address } = useWallet()
  const balance = useTokenBalance()

  const token = TOKENS[0]
  const units = toUnits(amount, token.decimals)
  const minimum = `${formatUnits(MIN_REWARD_UNITS, token.decimals)} ${token.symbol}`

  const problems: (string | null)[] = [
    description.trim().length < 10 ? 'Describe the challenge in at least a few words.' : null,
    units === null
      ? 'Enter an amount, like 25 or 0.5.'
      : units < MIN_REWARD_UNITS
        ? `The smallest reward is ${minimum}.`
        : balance.data !== undefined && units > balance.data
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
      await api('/api/quests/check', { json: { description: text } })

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
      return api<Quest>('/api/quests', { json: { description: text, onchainId: questId, txSignature } })
    },
    onSuccess: (quest) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['mine'] })
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      router.push(`/q/${quest.id}`)
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
            Sign in to post a quest. You’ll need a wallet to hold the reward, and we’ll make one for you if you
            don’t have one.
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
  const field = 'w-full rounded-[12px] bg-paper-raised px-4 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40'

  return (
    <div className="pb-[calc(49px+env(safe-area-inset-bottom)+96px)]">
      <NavBar
        title={STEPS[step]}
        back={step > 0}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        right={<span className="tabular text-[15px] text-ink-soft">{step + 1}/{STEPS.length}</span>}
      />
      <div className="mx-4 mt-1 flex gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <span key={label} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-moss' : 'bg-ink/10'}`} />
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
        <h1 className="px-4 pt-5 font-display text-[30px] leading-tight text-moss">
          {['What’s the dare?', 'What’s it worth?', 'Who can take it?', 'Look right?'][step]}
        </h1>

        {step === 0 && (
          <div className="mt-4 px-4">
            <label htmlFor="description" className="sr-only">
              Describe exactly what counts as done
            </label>
            <textarea
              id="description"
              value={description}
              maxLength={MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe exactly what counts as done. The video is checked against these words."
              className={`${field} resize-none py-3 leading-snug`}
            />
            <p className="tabular mt-1 text-right text-[13px] text-ink-soft">
              {description.length}/{MAX_LENGTH}
            </p>
          </div>
        )}
        {step === 0 && (
          <>
            <SectionHeader>Need a spark?</SectionHeader>
            <ul className={groupedList}>
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setDescription(example)}
                    className="w-full px-4 py-3 text-left text-[15px] leading-snug text-moss transition-colors active:bg-paper-sunk"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 1 && (
          <div className="mt-4 px-4">
            <TokenBalance />

            <label htmlFor="amount" className="sr-only">
              Reward
            </label>
            <div className="mt-6 flex items-baseline justify-center gap-2 rounded-[16px] bg-paper-raised px-4 py-6">
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
              <span className="text-[20px] font-semibold text-ink-soft">{token.symbol}</span>
            </div>
            {units !== null && units >= MIN_REWARD_UNITS && (
              <p className="tabular mt-3 text-center text-[15px] text-ink-soft">
                Winner gets {formatUnits(units - fee, token.decimals)} {token.symbol} after the 2.5% fee
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <>
            <SectionHeader>Who can take it</SectionHeader>
            <div className={groupedList} role="radiogroup">
              <Choice selected={questType === 'open'} onSelect={() => setQuestType('open')} title="Anyone" detail="Shows up in the public list" />
              <Choice selected={questType === 'direct'} onSelect={() => setQuestType('direct')} title="One person" detail="Only the wallet you name can claim it" />
            </div>
            {questType === 'open' ? (
              <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
                One person takes it at a time. If they give up or run out of time, it opens again.
              </p>
            ) : (
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

            <SectionHeader>Stays open for</SectionHeader>
            <div className="mx-4 flex rounded-[10px] bg-ink/[0.07] p-0.5" role="radiogroup">
              {TIME_LIMITS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={timeLimit === option.hours}
                  onClick={() => setTimeLimit(option.hours)}
                  className={`chrome h-[32px] flex-1 rounded-[8px] text-[13px] transition-all ${
                    timeLimit === option.hours ? 'bg-paper-raised font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.1)]' : 'text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && units !== null && (
          <div className={`${groupedList} mt-5`}>
            <Summary label="Challenge" onEdit={() => setStep(0)}>
              {description.trim()}
            </Summary>
            <Summary label="Reward" onEdit={() => setStep(1)}>
              {formatUnits(units, token.decimals)} {token.symbol}
              <span className="block text-[13px] text-ink-soft">Winner gets {formatUnits(units - fee, token.decimals)}</span>
            </Summary>
            <Summary label="Who" onEdit={() => setStep(2)}>
              {questType === 'open' ? 'Anyone' : shortAddress(target.trim())}
            </Summary>
            <Summary label="Open for" onEdit={() => setStep(2)}>
              {TIME_LIMITS.find((t) => t.hours === timeLimit)?.label}
            </Summary>
          </div>
        )}

        {(error || post.error) && (
          <p role="alert" className="px-6 pt-4 text-center text-[15px] text-wax">
            {error ?? errorMessage(post.error)}
          </p>
        )}
      </form>

      {/* Primary action sits just above the tab bar, where the thumb is. */}
      <div className="chrome fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-3 pt-6">
        <button type="submit" form="post-form" disabled={post.isPending} className={`${button()} w-full`}>
          {step < STEPS.length - 1
            ? 'Continue'
            : phase === 'signing'
              ? 'Confirm in your wallet…'
              : post.isPending
                ? 'Posting…'
                : `Post and lock ${formatUnits(units ?? 0, token.decimals)} ${token.symbol}`}
        </button>
      </div>
    </div>
  )
}

function Choice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-paper-sunk"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px]">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-soft">{detail}</span>
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-moss" strokeWidth={2.75} aria-hidden />}
    </button>
  )
}

function Summary({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onEdit} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-paper-sunk">
      <span className="w-[84px] shrink-0 text-[15px] text-ink-soft">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug">{children}</span>
      <span className="shrink-0 text-[15px] text-moss">Edit</span>
    </button>
  )
}
