'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Share, SquarePlus } from 'lucide-react'
import { button } from './button'

// Chrome/Android fire this so the page can show its own install button.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const OPEN_EVENT = 'quest:install'
const DISMISSED_KEY = 'quest.install.dismissedAt'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
/** Screens where a sheet would get in the way. */
const QUIET = [/^\/welcome/, /^\/q\/[^/]+\/record/]

/** Opens the Add to Home Screen sheet from anywhere, e.g. a row on the You tab. */
export function openInstallSheet() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** True once the app is running from the Home Screen rather than in a browser tab. */
export function useStandalone() {
  const [standalone, setStandalone] = useState(true)
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    setStandalone(nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches)
  }, [])
  return standalone
}

function readDismissed() {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  } catch {
    // Private mode: the sheet just shows again next visit.
  }
}

export function InstallSheet() {
  const pathname = usePathname() ?? '/'
  const standalone = useStandalone()
  const [open, setOpen] = useState(false)
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as InstallPromptEvent)
    }
    const onOpen = () => setOpen(true)
    const onInstalled = () => setOpen(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener(OPEN_EVENT, onOpen)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener(OPEN_EVENT, onOpen)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // First visit in the browser: offer it once things have settled, then stay quiet for a week.
  useEffect(() => {
    if (standalone || QUIET.some((re) => re.test(pathname))) return
    if (Date.now() - readDismissed() < SNOOZE_MS) return
    const t = setTimeout(() => setOpen(true), 1500)
    return () => clearTimeout(t)
    // Only on the first screen they land on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone])

  const close = useCallback(() => {
    writeDismissed()
    setOpen(false)
  }, [])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    close()
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 500) close()
  }

  return (
    <AnimatePresence>
      {open && !standalone && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="install-title">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-night/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
          />
          <motion.div
            className="chrome absolute inset-x-0 bottom-0 rounded-t-[20px] bg-paper-raised px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 shadow-[0_-8px_40px_rgba(38,38,31,0.18)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div aria-hidden className="mx-auto h-[5px] w-9 rounded-full bg-ink/20" />

            <div className="mt-5 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/apple-icon"
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded-[15px] shadow-[0_2px_8px_rgba(38,38,31,0.18)]"
              />
              <div className="min-w-0">
                <h2 id="install-title" className="text-[20px] font-semibold leading-tight">
                  Get the Quest app
                </h2>
                <p className="mt-1 text-[15px] leading-snug text-ink-soft">
                  Add it to your Home Screen. It opens full screen, with no browser bars.
                </p>
              </div>
            </div>

            {deferred ? (
              <button type="button" onClick={install} className={`${button()} mt-6 w-full`}>
                Add to Home Screen
              </button>
            ) : (
              <ol className="mt-6 divide-y-[0.5px] divide-ink/15 overflow-hidden rounded-[12px] bg-paper">
                <Step n={1} icon={<Share className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />}>
                  Tap <strong className="font-semibold">Share</strong> in Safari’s toolbar
                  <span className="block text-[13px] text-ink-soft">On newer iPhones it’s under the ••• button</span>
                </Step>
                <Step n={2} icon={<SquarePlus className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />}>
                  Choose <strong className="font-semibold">Add to Home Screen</strong>
                  <span className="block text-[13px] text-ink-soft">Scroll the list down if you don’t see it</span>
                </Step>
                <Step n={3} icon={<span className="font-display text-[17px] leading-none">Q</span>}>
                  Open <strong className="font-semibold">Quest</strong> from your Home Screen
                </Step>
              </ol>
            )}

            <button type="button" onClick={close} className="press mt-3 h-11 w-full text-[17px] text-moss">
              Not now
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 px-4 py-3">
      <span className="sr-only">Step {n}.</span>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-paper-raised text-moss shadow-[0_0_0_0.5px_rgba(38,38,31,0.15)]"
      >
        {icon}
      </span>
      <span className="text-[15px] leading-snug">{children}</span>
    </li>
  )
}
