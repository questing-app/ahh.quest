'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { NameForm } from '@/components/name-form'
import { button } from '@/components/button'
import { useSession } from '@/lib/session'
import { useMe } from '@/lib/queries'
import { hasDefaultName } from '@/lib/types'
import { shortAddress } from '@/lib/tokens'

// Mirrors the four-panel onboarding from the iOS app (product/screens.png).
const PANELS = [
  {
    art: '/art/wallet.png',
    alt: 'A wizard points a knight on horseback toward a small chest on a mountain path',
    title: 'Your wallet',
    body: 'Rewards are locked until a quest is done, then paid straight to the winner’s wallet. Sign in and we’ll set one up.',
  },
  {
    art: '/art/profile.png',
    alt: 'A wizard writes on a profile scroll pinned to an easel while a knight looks on',
    title: 'Your name',
    body: 'This is what people see on quests you post and complete.',
  },
  {
    art: '/art/walkthrough.png',
    alt: 'A wizard explains a map of arrows between a castle, a sword and a chest',
    title: 'How it works',
    body: 'Post a challenge with a reward, or take one someone else posted. Film it in one take. If the video passes, the reward is paid.',
  },
  {
    art: '/art/complete.png',
    alt: 'A knight hands a glowing coin to a wizard beside an open chest of gold',
    title: 'Get paid',
    body: 'You have 24 hours after taking a quest to send your video. Once it’s approved, the reward and your deposit are yours.',
  },
]

export default function WelcomePage() {
  const [index, setIndex] = useState(0)
  const panel = PANELS[index]
  const last = index === PANELS.length - 1

  return (
    <main className="chrome mx-auto flex min-h-[100dvh] max-w-[520px] flex-col overflow-x-hidden px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[env(safe-area-inset-top)]">
      <header className="grid h-11 grid-cols-[1fr_auto_1fr] items-center">
        <div>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="press -ml-2 flex h-11 items-center px-2 text-[17px] text-moss"
            >
              Back
            </button>
          )}
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {PANELS.map((p, i) => (
            <span
              key={p.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-moss' : 'w-1.5 bg-ink/20'}`}
            />
          ))}
        </div>
        <div className="flex justify-end">
          {!last && (
            <Link href="/" className="press -mr-2 flex h-11 items-center px-2 text-[17px] text-moss">
              Skip
            </Link>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        >
          <Image src={panel.art} alt={panel.alt} width={390} height={360} priority className="art-fade -mx-6 w-[calc(100%+3rem)] max-w-none" />
          <div className="mt-1 text-center">
            <p className="tabular text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              Step {index + 1} of {PANELS.length}
            </p>
            <h1 className="mt-2 font-display text-[34px] leading-none text-moss">{panel.title}</h1>
            <p className="mx-auto mt-3 max-w-[22rem] text-[17px] leading-relaxed text-ink-soft">{panel.body}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6">
        {index === 0 && <WalletStep onNext={() => setIndex(1)} />}
        {index === 1 && <ProfileStep onNext={() => setIndex(2)} />}
        {index === 2 && (
          <button type="button" onClick={() => setIndex(3)} className={`${button()} w-full`}>
            Got it
          </button>
        )}
        {last && (
          <Link href="/" className={`${button()} w-full`}>
            Find a quest
          </Link>
        )}
      </div>
    </main>
  )
}

function WalletStep({ onNext }: { onNext: () => void }) {
  const { authenticated, login } = useSession()
  const { wallets } = useSolanaWallets()
  const address = wallets[0]?.address

  if (!authenticated) {
    return (
      <button type="button" onClick={login} className={`${button()} w-full`}>
        Sign in
      </button>
    )
  }
  if (!address) return <p className="text-center text-[15px] text-ink-soft">Setting up your wallet…</p>

  return (
    <>
      <p className="mb-4 text-center text-[15px]">
        Your wallet: <span className="font-mono">{shortAddress(address)}</span>
      </p>
      <button type="button" onClick={onNext} className={`${button()} w-full`}>
        Next
      </button>
    </>
  )
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const { data: me } = useMe()
  if (!me) return <p className="text-center text-[15px] text-ink-soft">Loading your account…</p>

  return (
    <>
      <NameForm user={me} onDone={onNext} submitLabel="Save" />
      {!hasDefaultName(me) && (
        <button type="button" onClick={onNext} className="press mt-3 w-full py-2 text-center text-[15px] text-moss">
          Keep {me.username}
        </button>
      )}
    </>
  )
}
