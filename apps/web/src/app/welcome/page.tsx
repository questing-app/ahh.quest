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
    title: 'Create Wallet',
    body: 'Rewards are held in a wallet until a quest is done, then paid straight into the winner’s. Sign in and we’ll set one up for you.',
  },
  {
    art: '/art/profile.png',
    alt: 'A wizard writes on a profile scroll pinned to an easel while a knight looks on',
    title: 'Set Up Profile',
    body: 'Pick the name people see on the quests you post and the ones you complete.',
  },
  {
    art: '/art/walkthrough.png',
    alt: 'A wizard explains a map of arrows between a castle, a sword and a chest',
    title: 'Walkthrough',
    body: 'Post a dare and put up a reward, or claim one someone else posted. Film it in one take. The video is checked, and if it passes the reward is paid out.',
  },
  {
    art: '/art/complete.png',
    alt: 'A knight hands a glowing coin to a wizard beside an open chest of gold',
    title: 'Complete Quest',
    body: 'You have 24 hours after claiming to send your proof. Once it’s approved, the reward and your deposit land in your wallet.',
  },
]

export default function WelcomePage() {
  const [index, setIndex] = useState(0)
  const panel = PANELS[index]
  const last = index === PANELS.length - 1

  return (
    <main className="chrome mx-auto flex min-h-[100dvh] max-w-[520px] flex-col overflow-x-hidden px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[env(safe-area-inset-top)]">
      <header className="flex h-11 items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${PANELS.length}`}>
          {PANELS.map((p, i) => (
            <span
              key={p.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-moss' : 'w-1.5 bg-ink/20'}`}
            />
          ))}
        </div>
        {!last && (
          <Link href="/" className="press text-[17px] text-moss">
            Skip
          </Link>
        )}
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
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-moss/80">Onboarding quest</p>
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
