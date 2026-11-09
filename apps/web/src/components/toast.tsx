'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck } from 'lucide-react'

const EVENT = 'quest:toast'

/** Brief confirmation after an action lands, like "Quest posted". */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }))
}

export function Toaster() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)

  useEffect(() => {
    const onToast = (e: Event) => setMessage({ text: (e as CustomEvent<string>).detail, id: Date.now() })
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 2600)
    return () => clearTimeout(t)
  }, [message])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[60] flex justify-center px-4"
    >
      <AnimatePresence>
        {message && (
          <motion.p
            key={message.id}
            className="chrome flex max-w-full items-center gap-2 rounded-full bg-night/90 py-2.5 pl-3.5 pr-4 text-[15px] font-medium text-paper-raised shadow-[0_8px_24px_rgba(21,21,16,0.25)] backdrop-blur-xl"
            initial={{ y: -40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 380 }}
          >
            <CircleCheck className="h-[18px] w-[18px] shrink-0 text-moss-pale" strokeWidth={2.25} aria-hidden />
            <span className="truncate">{message.text}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
