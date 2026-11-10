'use client'

import Image from 'next/image'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { PROGRAM_ID } from '@quest/sdk'
import { NameForm } from '@/components/name-form'
import { PhotoPicker } from '@/components/photo-picker'
import { Sheet } from '@/components/sheet'
import { button } from '@/components/button'
import { useSession } from '@/lib/session'
import { useMe } from '@/lib/queries'
import { hasDefaultName } from '@/lib/types'
import { explorerAddress } from '@/lib/chain'
import { MAX_SECONDS, MIN_SECONDS } from '@/lib/proof'

// First run (screen map F2 → F3 → F4 → F5). F1 is the intro on the Quests tab.
// The money-is-safe step comes before sign-in because "who holds my money?"
// is the first thing people ask (product/onboarding research).
type Step = 'how' | 'safe' | 'name'
const ORDER: Step[] = ['how', 'safe', 'name']

/** Only same-site paths, so ?next= can't send people elsewhere. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/welcome') ? value : '/'
}

export default function WelcomePage() {
  return (
    <Suspense>
      <Welcome />
    </Suspense>
  )
}

function Welcome() {
  const params = useSearchParams()
  const router = useRouter()
  const next = safeNext(params.get('next'))
  const initial = (ORDER as string[]).includes(params.get('step') ?? '') ? (params.get('step') as Step) : 'how'
  const [step, setStep] = useState<Step>(initial)
  const index = ORDER.indexOf(step)
  const finish = () => router.replace(next)

  return (
    <main className="chrome mx-auto flex min-h-[100dvh] max-w-[520px] flex-col overflow-x-hidden px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[env(safe-area-inset-top)]">
      <header className="grid h-11 grid-cols-[1fr_auto_1fr] items-center">
        <div>
          {index > 0 && initial !== 'name' && (
            <button
              type="button"
              onClick={() => setStep(ORDER[index - 1])}
              className="press -ml-2 flex h-11 items-center px-2 text-[17px] text-moss"
            >
              ‹ Back
            </button>
          )}
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {initial !== 'name' &&
            ORDER.map((s) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-5 bg-moss' : 'w-1.5 bg-ink/20'}`}
              />
            ))}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={finish} className="press -mr-2 flex h-11 items-center px-2 text-[17px] text-moss">
            Skip
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
          {step === 'how' && <HowItWorks onNext={() => setStep('safe')} />}
          {step === 'safe' && <MoneyIsSafe onNext={() => setStep('name')} />}
          {step === 'name' && <PickName onDone={finish} />}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

function Art({ src, alt, short }: { src: string; alt: string; short?: boolean }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={390}
      height={360}
      priority
      className={`art-fade -mx-6 w-[calc(100%+3rem)] max-w-none object-cover ${short ? 'max-h-[22dvh]' : 'max-h-[32dvh]'}`}
    />
  )
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mt-1">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[32px] leading-[1.05] text-moss">{title}</h1>
    </div>
  )
}

/** F2: the whole loop on one screen. */
function HowItWorks({ onNext }: { onNext: () => void }) {
  const steps = [
    ['Post a dare', 'Write the challenge and lock up a reward.'],
    ['Someone films it', `They get 24 hours and one take of ${MIN_SECONDS}–${MAX_SECONDS} seconds.`],
    ['Approved means paid', 'The reward goes straight to their wallet.'],
  ]
  return (
    <>
      <Art src="/art/walkthrough.png" alt="A wizard explains a map of arrows between a castle, a sword and a chest" />
      <Heading eyebrow="How it works" title="Three steps" />
      <ol className="mx-auto mt-5 w-full max-w-[22rem] space-y-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3.5">
            <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss-pale font-display text-[17px] text-moss-deep">
              {i + 1}
            </span>
            <span className="pt-0.5">
              <span className="block text-[17px] font-semibold leading-snug">{title}</span>
              <span className="block text-[15px] leading-relaxed text-ink-soft">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-6">
        <button type="button" onClick={onNext} className={`${button()} w-full`}>
          Next
        </button>
      </div>
    </>
  )
}

/** F3 → F4: answer "who holds the money" before asking anyone to sign in. */
function MoneyIsSafe({ onNext }: { onNext: () => void }) {
  const { ready, authenticated, login } = useSession()
  const [waiting, setWaiting] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)

  // Privy's sheet closes on success; carry on to the name step.
  useEffect(() => {
    if (waiting && authenticated) onNext()
  }, [waiting, authenticated, onNext])

  const points = [
    { title: 'Locked when it’s posted', body: 'The reward sits in an on-chain vault, not with Quest and not with the poster.' },
    { title: 'No take-backs', body: 'Once someone takes the quest, the poster can’t pull the money.' },
    { title: 'Fair judging', body: 'An AI checks the video. If the poster doesn’t answer in time, it approves itself.' },
  ]

  return (
    <>
      <Art short src="/art/wallet.png" alt="A wizard points a knight on horseback toward a small chest on a mountain path" />
      <Heading eyebrow="Your money is safe" title="Rewards are locked up" />
      <ul className="mx-auto mt-4 w-full max-w-[22rem] space-y-3">
        {points.map(({ title, body }) => (
          <li key={title} className="flex gap-3.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-moss text-white">
              <Check className="h-[14px] w-[14px]" strokeWidth={3} aria-hidden />
            </span>
            <span>
              <span className="block text-[17px] font-semibold leading-snug">{title}</span>
              <span className="block text-[15px] leading-relaxed text-ink-soft">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            if (authenticated) return onNext()
            setWaiting(true)
            login()
          }}
          className={`${button()} w-full`}
        >
          Continue
        </button>
        <button type="button" onClick={() => setVaultOpen(true)} className="press mt-1 h-11 w-full text-[17px] text-moss">
          How the vault works
        </button>
      </div>

      <Sheet open={vaultOpen} onClose={() => setVaultOpen(false)} label="How the vault works">
        <h2 className="text-[22px] font-bold leading-tight">How the vault works</h2>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>
            When a quest is posted, the reward moves out of the poster’s wallet into an account owned by the Quest
            program on Solana. No person holds a key to it, Quest included.
          </p>
          <p>
            The program only releases it four ways: to the person whose video is approved, back to the poster if they
            cancel before anyone takes it, back to the poster if the video is rejected, or back to the poster if
            nobody finishes in time. Quest’s video checker picks between those outcomes; it can’t send the money
            anywhere else.
          </p>
          <p>Every quest page links to its vault so you can check the balance yourself.</p>
        </div>
        <a
          href={explorerAddress(PROGRAM_ID.toBase58())}
          target="_blank"
          rel="noreferrer"
          className={`${button('outline')} mt-5 w-full`}
        >
          View on Solana Explorer
        </a>
        <button type="button" onClick={() => setVaultOpen(false)} className="press mt-1 h-11 w-full text-[17px] text-moss">
          Close
        </button>
      </Sheet>
    </>
  )
}

/** F5: a photo and a name, both optional. Skipping leaves the short wallet address as the name. */
function PickName({ onDone }: { onDone: () => void }) {
  const { ready, authenticated, login } = useSession()
  const { data: me } = useMe()

  // People who already picked a name don't need this step.
  useEffect(() => {
    if (me && !hasDefaultName(me)) onDone()
  }, [me, onDone])

  return (
    <>
      <h1 className="mt-6 font-display text-[30px] leading-[1.1] text-moss">What should people call you?</h1>
      <div className="mt-6">
        {!ready ? null : !authenticated ? (
          <>
            <p className="text-[15px] leading-relaxed text-ink-soft">Sign in first, then pick the name people see.</p>
            <button type="button" onClick={login} className={`${button()} mt-4 w-full`}>
              Sign in
            </button>
          </>
        ) : !me ? (
          <p className="text-[15px] text-ink-soft">Setting up your account…</p>
        ) : (
          <>
            <div className="mb-5">
              <PhotoPicker user={me} size={72} caption inline ring="ring-paper" />
            </div>
            <NameForm user={me} onDone={onDone} submitLabel="Done" stacked />
          </>
        )}
      </div>
    </>
  )
}
