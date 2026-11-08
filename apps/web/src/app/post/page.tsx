'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SiteHeader } from '@/components/site-header'
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
      <>
        <SiteHeader />
        <main className="mx-auto max-w-page px-4 py-16 md:px-8">
          <h1 className="font-display text-[36px] leading-tight">Sign in to post a quest</h1>
          <p className="mt-3 text-[17px] text-ink-soft">You’ll need a wallet to hold the reward. We’ll make one for you if you don’t have one.</p>
          <button type="button" onClick={login} className={`${button()} mt-7`}>
            Sign in
          </button>
        </main>
      </>
    )
  }

  const error = touched ? problems[step] : null
  const fee = units ? feeFor(units) : 0

  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-page gap-8 px-4 py-8 md:grid-cols-[200px_minmax(0,560px)] md:gap-16 md:px-8 md:py-12">
        <nav aria-label="Steps">
          <p className="text-sm text-ink-soft md:hidden">
            Step {step + 1} of {STEPS.length}
          </p>
          <ol className="hidden space-y-3 text-[15px] md:block">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`border-l-2 pl-3 text-left ${
                    i === step ? 'border-moss font-semibold text-ink' : 'border-transparent text-ink-soft disabled:text-ink-soft/50'
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step < STEPS.length - 1) next()
            else post.mutate()
          }}
        >
          <h1 className="font-display text-[34px] leading-tight md:text-[40px]">
            {['What’s the dare?', 'What’s it worth?', 'Who can take it?', 'Look right?'][step]}
          </h1>

          {step === 0 && (
            <div className="mt-6">
              <label htmlFor="description" className="text-[15px] font-semibold">
                Describe exactly what counts as done
              </label>
              <textarea
                id="description"
                value={description}
                maxLength={MAX_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Be specific. The video is checked against these words."
                className="mt-2 w-full resize-none rounded-md border border-rule bg-paper-raised px-4 py-3 text-[17px] placeholder:text-ink-soft/70 focus:border-moss focus:outline-none"
              />
              <p className="tabular mt-1 text-right text-sm text-ink-soft">
                {description.length}/{MAX_LENGTH}
              </p>
              <p className="mt-4 text-sm text-ink-soft">Need a spark?</p>
              <div className="mt-2 flex flex-col items-start gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setDescription(example)}
                    className="text-left text-[15px] text-moss underline-offset-4 hover:underline"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-6">
              <TokenBalance />

              <label htmlFor="amount" className="mt-6 block text-[15px] font-semibold">
                Reward
              </label>
              <div className="mt-2 flex items-baseline gap-3 border-b-2 border-ink/20 focus-within:border-moss">
                <input
                  id="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="0"
                  className="tabular w-full bg-transparent py-2 font-display text-[44px] leading-none focus:outline-none"
                />
                <span className="text-lg font-semibold">{token.symbol}</span>
              </div>
              {units !== null && units >= MIN_REWARD_UNITS && (
                <p className="tabular mt-3 text-[15px] text-ink-soft">
                  The winner gets {formatUnits(units - fee, token.decimals)} {token.symbol} after the 2.5% fee.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-8">
              <fieldset>
                <legend className="text-[15px] font-semibold">Who can take it</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Choice selected={questType === 'open'} onSelect={() => setQuestType('open')} title="Anyone" detail="It shows up in the public list." />
                  <Choice selected={questType === 'direct'} onSelect={() => setQuestType('direct')} title="One person" detail="Only the wallet you name can claim it." />
                </div>
              </fieldset>

              {questType === 'open' ? (
                <p className="text-[15px] text-ink-soft">
                  One person takes it at a time. If they give up or run out of time, it opens again.
                </p>
              ) : (
                <div>
                  <label htmlFor="target" className="text-[15px] font-semibold">
                    Their Solana wallet address
                  </label>
                  <input
                    id="target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 w-full rounded-md border border-rule bg-paper-raised px-4 py-3 font-mono text-[15px] focus:border-moss focus:outline-none"
                  />
                </div>
              )}

              <fieldset>
                <legend className="text-[15px] font-semibold">How long it stays open</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TIME_LIMITS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={timeLimit === option.hours}
                      onClick={() => setTimeLimit(option.hours)}
                      className={`rounded-md border px-4 py-2 text-[15px] ${timeLimit === option.hours ? 'border-moss bg-moss-pale font-semibold' : 'border-rule hover:border-ink/40'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 3 && units !== null && (
            <dl className="mt-6 divide-y divide-rule border-y border-rule text-[15px]">
              <Summary label="Challenge" onEdit={() => setStep(0)}>
                {description.trim()}
              </Summary>
              <Summary label="Reward" onEdit={() => setStep(1)}>
                {formatUnits(units, token.decimals)} {token.symbol}
                <span className="text-ink-soft"> (winner gets {formatUnits(units - fee, token.decimals)})</span>
              </Summary>
              <Summary label="Who" onEdit={() => setStep(2)}>
                {questType === 'open' ? 'Anyone' : shortAddress(target.trim())}
              </Summary>
              <Summary label="Open for" onEdit={() => setStep(2)}>
                {TIME_LIMITS.find((t) => t.hours === timeLimit)?.label}
              </Summary>
            </dl>
          )}

          {error && (
            <p role="alert" className="mt-4 text-[15px] text-wax">
              {error}
            </p>
          )}
          {post.error && (
            <p role="alert" className="mt-4 text-[15px] text-wax">
              {errorMessage(post.error)}
            </p>
          )}

          <div className="mt-10 flex gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className={button('outline')}>
                Back
              </button>
            )}
            <button type="submit" disabled={post.isPending} className={button()}>
              {step < STEPS.length - 1
                ? 'Next'
                : phase === 'signing'
                  ? 'Confirm in your wallet…'
                  : post.isPending
                    ? 'Posting…'
                    : `Post and lock ${formatUnits(units ?? 0, token.decimals)} ${token.symbol}`}
            </button>
          </div>
        </form>
      </main>
    </>
  )
}

function Choice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-md border px-4 py-3.5 text-left ${selected ? 'border-moss bg-moss-pale' : 'border-rule bg-paper-raised hover:border-ink/40'}`}
    >
      <span className="block text-[15px] font-semibold">{title}</span>
      <span className="mt-0.5 block text-sm text-ink-soft">{detail}</span>
    </button>
  )
}

function Summary({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-4 py-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{children}</dd>
      <dd>
        <button type="button" onClick={onEdit} className="text-sm text-moss underline-offset-4 hover:underline">
          Edit
        </button>
      </dd>
    </div>
  )
}
