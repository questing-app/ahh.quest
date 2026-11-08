'use client'

import { useState } from 'react'
import { button } from './button'

/** Two-step destructive action, shown inline instead of a browser dialog. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  pending,
  variant = 'danger',
}: {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
  variant?: 'danger' | 'link'
}) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={variant === 'link' ? 'text-sm text-ink-soft underline underline-offset-4 hover:text-wax' : button('danger', 'sm')}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-2 text-sm">
      <p>{question}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} disabled={pending} className={button('danger', 'sm')}>
          {pending ? 'Working…' : confirmLabel}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={pending} className={button('outline', 'sm')}>
          Never mind
        </button>
      </div>
    </div>
  )
}
