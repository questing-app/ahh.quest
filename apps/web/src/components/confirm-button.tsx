'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { button } from './button'

/** Destructive action confirmed through an iOS-style action sheet. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  pending,
  variant = 'danger',
  className,
}: {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
  variant?: 'danger' | 'link'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const trigger =
    className ??
    (variant === 'link' ? 'press w-full py-2 text-center text-[15px] text-wax' : `${button('danger')} w-full`)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={pending} className={trigger}>
        {pending ? 'Working…' : label}
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={question}>
                <motion.button
                  type="button"
                  aria-label="Close"
                  className="absolute inset-0 bg-night/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  className="chrome absolute inset-x-2 bottom-0 space-y-2 pb-[calc(env(safe-area-inset-bottom)+8px)]"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 380 }}
                >
                  <div className="overflow-hidden rounded-[14px] bg-paper-raised/95 backdrop-blur-xl">
                    <p className="px-6 py-4 text-center text-[13px] leading-snug text-ink-soft">{question}</p>
                    <button
                      type="button"
                      className="press h-[57px] w-full border-t-[0.5px] border-ink/15 text-[20px] text-wax"
                      onClick={() => {
                        setOpen(false)
                        onConfirm()
                      }}
                    >
                      {confirmLabel}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="press h-[57px] w-full rounded-[14px] bg-paper-raised text-[20px] font-semibold text-moss"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
